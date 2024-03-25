
const { ImapFlow } = require('imapflow');
const nconf = require('nconf'); 
const { htmlToText } = require('html-to-text');
const {consola, CreateConsola} = require('consola');


nconf.file({ file: './config.json' });
consola.wrapConsole();

let emailAddress = nconf.get('emailAddress');
let emailPassword = nconf.get('emailPassword');
console.log(`Email Address: ${emailAddress}, Email Password: ${emailPassword ? 'hidden' : 'undefined or empty'}`);

let fastmailConfig = {
    auth: {
        user: emailAddress,
        pass: emailPassword,
    },
    host: 'imap.fastmail.com',
    port: 993,
    secure: true,
};

let accountMappings = nconf.get('accountDetails');

async function fetchAndParseEmails() {
    const client = new ImapFlow(fastmailConfig);
    let messages = [];

    try {
        await client.connect();
        console.log('Connected to IMAP server.');

        let mailboxes = await client.list();
        console.log('Available mailboxes:', mailboxes.map(mb => mb.path));

        let mailboxOpenResult = await client.mailboxOpen('BankTransactionUpdate');
        console.log('Selected mailbox details:', mailboxOpenResult);

        if (!mailboxOpenResult || mailboxOpenResult.exists === 0) {
            throw new Error('Mailbox not found or empty');
        }

        const messageUids = await client.search({seen: false});
        console.log({ uidCount: messageUids.length }, 'Fetching unseen emails');
        const fetchOptions = { bodyStructure: true, internalDate: true, envelope: true, bodyParts: ['1'], markSeen: false};

        console.log('Preparing to fetch unseen emails...');
        
        for (const uid of messageUids) {
            consola.debug('Attempting to fetch this email UID ', { uid });
            try {
                const message = await client.fetchOne(uid, fetchOptions);
                if (message) {
                    const transaction = parseEmailToTransaction(message, accountMappings);
                    consola.debug({ transaction }, 'Constructed transaction object');
                    if (transaction) {
                        console.log(`${transaction.amount} from ${transaction.payee_name}, adding to transactions array for account, ${transaction.account}`);
                        messages.push(transaction);
                        await client.messageMove(uid, 'TransactionAdded' ); //change after testing
                    } else {
                        console.warn({ uid }, 'No transaction message found for UID');
                    }
                } else {
                    console.warn({ uid }, 'No message found for UID');
                }
            } catch (error) {
                console.error({ uid }, 'Error fetching email UID:', error);
            }
        }

        console.log(`Fetched ${messages.length} messages`);
    } catch (error) {
        
        console.error('Error fetching or parsing emails:', error);
    } finally {
        await client.logout();
    }
    return messages;
   
}

 

function parseEmailToTransaction(email, accountMappings) {
    // Determine the corresponding account using the sender email
    consola.debug({email}, 'Parsing email to transaction');
    let accountMapping = accountMappings.find(mapping => email.envelope.from[0].address === mapping.SenderEmails);
    if (!accountMapping) return null;
    let charSet = getFirstPartCharset(email.bodyStructure);
    let emailText = "";

    let emailBody = email.bodyParts.get('1');

    if (emailBody) {
        if (email.bodyStructure.type === 'text/html') {
            const emailTextHtml = emailBody.toString(charSet);
            emailText = htmlToText(emailTextHtml); // Assuming htmlToText is correctly implemented or imported
        } else {
            emailText = emailBody.toString(charSet);
        }
    }

    if (!emailText) {
        console.error('Unable to extract email text.');
        return null;
    }

    consola.debug({emailText}, 'Parsed email text');

    // Apply regex parsing rules from accountMapping to extract transaction details
    let isOutflow = new RegExp(accountMapping.transactionRegex).test(email.envelope.subject);
    let isNotClear = new RegExp(accountMapping.pendingRegex)?.test(email.envelope.subject);
    let merchantRegex = new RegExp(accountMapping.merchantRegex);
    let merchantMatch = emailText.match(merchantRegex);
    let merchant = merchantMatch[0];
    let amountRegex = new RegExp(accountMapping.AmountRegex);
    let amountMatch = emailText.match(amountRegex);
    let strAmount = amountMatch[0].replace('$','');
    let parsedAmount = parseFloat(strAmount); // Parse amount as float 
    let amount = Math.round(parsedAmount * 100);
    let date = email.internalDate; // The date the email was sent

    consola.debug({ isOutflow, isNotClear, merchant, amount, date }, 'Parsed transaction details');
    // Construct and return the transaction object

    if (isNaN(amount)) {
        console.error(`Failed to parse amount from text: ${strAmount}`);
        return null;
    }
    
    return {
        account: accountMapping.actualAccountId,
        date: date.toISOString().split('T')[0], // Format the date as YYYY-MM-DD
        amount: isOutflow ? -Math.abs(amount) : amount, //  ensure outflows are negative
        payee_name: merchant,
        cleared: !isNotClear, // Assuming false means it's pending, true means it's cleared
        notes: `Email subject: ${email.envelope.subject}`, // Include the email subject in notes for reference
        imported_id: email.envelope.messageId // Use email messageId as a unique identifier

        
    };
}
function getFirstPartCharset(bodyStructure) {
    if (bodyStructure.childNodes && bodyStructure.childNodes.length > 0) {
        // Assuming the first part is what we're interested in
        const firstPart = bodyStructure.childNodes[0];
        if (firstPart.parameters && firstPart.parameters.charset) {
            if  (firstPart.parameters.charset === 'iso-8859-1'){
                return 'latin1'; // Use 'latin1' for 'iso-8859-1'
            }
            return firstPart.parameters.charset; // Return charset of the first part
        }
    }
    return 'utf-8'; // Default charset if not specified
}



module.exports = { fetchAndParseEmails };

