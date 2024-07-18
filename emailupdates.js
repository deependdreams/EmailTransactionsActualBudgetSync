
const { ImapFlow } = require('imapflow');
const nconf = require('nconf'); 
const { htmlToText } = require('html-to-text');
const {consola, createConsola} = require('consola');
const Table = require('cli-table3');
const block = require('cli-block');
var colors = require('colors/safe');

nconf.file({ file: './config.json' });

let emailAddress = nconf.get('emailAddress');
let emailPassword = nconf.get('emailPassword');
console.log(`Email Address: ${emailAddress}, Email Password: ${emailPassword ? 'hidden' : 'undefined or empty'}`);
function displayMailboxes(mailboxes) {
    block.start('IMAP Log');
    block.blockHeader('Available Mailboxes @ ' + new Date().toLocaleTimeString());
    const formattedMailboxes = mailboxes.map(mb => mb.path);
    // Calculate the length of each column by dividing total items by 3
    const third = Math.ceil(formattedMailboxes.length / 3);
    const firstColumn = formattedMailboxes.slice(0, third);
    const secondColumn = formattedMailboxes.slice(third, 2 * third);
    const thirdColumn = formattedMailboxes.slice(2 * third);

   // Create a new table with three columns
   const table = new Table({
    style: { border: [], header: [] },
    colWidths: [15, 15, 15], // Adjust column widths if necessary
    wordWrap: true,
});

// Fill the table with mailbox names, ensuring all columns align by row count
for (let i = 0; i < third; i++) {
    table.push([
        firstColumn[i] || '',
        secondColumn[i] || '',
        thirdColumn[i] || ''
    ]);
}
    block.blockLine(console.log(table.toString()));
    block.blockFooter();
}

function displayMailboxDetails(mailbox) {
    block.start("mailbox connection");
    block.blockHeader('Selected Mailbox: ' + mailbox.path);
    const table = new Table({
        head: ['Property', 'Value'],
        colWidths: [20, 60], wordWrap: true,
    });

    // Add rows for each property
    table.push(
        ['Exists', mailbox.exists],
        ['UID Validity', mailbox.uidValidity.toString()],
        ['UID Next', mailbox.uidNext.toString()],
        ['Unseen', mailbox.unseen || '0'],
        ['Highest ModSeq', mailbox.highestModseq.toString()],
        ['Read Only', mailbox.readOnly],
        ['Flags', Array.from(mailbox.flags).join(', ')],
        ['Permanent Flags', Array.from(mailbox.permanentFlags).join(', ')]
    );

    block.blockLine(console.log(table.toString()));
    block.blockFooter();
}
  
  const imapConsola = createConsola({
    
    //level: 4,
    fancy: true,
  formatOptions: {
  columns: 80,
    colors: true,
    compact: true,
  //     date: false,
 },
});
let fastmailConfig = {
    auth: {
        user: emailAddress,
        pass: emailPassword,
    },
    host: 'imap.fastmail.com',
    port: 993,
    secure: true,
    logger: imapConsola
};

let accountMappings = nconf.get('accountDetails');

async function fetchAndParseEmails() {
    
    const client = new ImapFlow(fastmailConfig);
    let messages = [];

    try {
        await client.connect();
        imapConsola.info('Connected to IMAP server.');

        let mailboxes = await client.list();
       displayMailboxes(mailboxes);
//formattinghere
        let mailboxOpenResult = await client.mailboxOpen('BankTransactionUpdate');
        displayMailboxDetails(mailboxOpenResult);
//formattinghere
        if (!mailboxOpenResult || mailboxOpenResult.exists === 0) {
            throw new Error('Mailbox not found or empty');
        }
        const messageTable = new Table({
            head: ['UID', 'Date', 'Subject', 'Matched', 'Moved', 'Amount', 'Payee', colors.cyan('Account')],
            style: { 'padding-left': 0, 'padding-right': 0 },
            colWidths: [null, null, 45, null,null, null, 25, 25],
            wordWrap: true,
            wrapOnWordBoundary: false
        });

        const messageCount = await client.search({seen: false});
        const messageUids = [];
        if (messageCount.length === 0) {
            console.log('No unseen messages to process.');
            return messages; // Exit if no new messages
        }
        console.log(`Fetching unseen emails... Total: ${messageUids.length}`);
        const fetchOptions = { bodyStructure: true, internalDate: true, envelope: true, bodyParts: ['1'], markSeen: false, uid: true};
       

        console.log('Preparing to fetch unseen emails...');
        for await (let msg of client.fetch('1:*', {uid: true})){
            console.log(msg.uid);
            messageUids.push(msg.uid);
            
        }
       const messageMove = [];
        for (const uid of messageUids) {
            consola.debug('Attempting to fetch this email UID ', { uid });
            try {
                const message = await client.fetchOne(uid, fetchOptions, {uid: true});
                if (message) {
                    const transaction = parseEmailToTransaction(message, accountMappings);
                    
                    if (transaction) {
                        messages.push(transaction);
                        messageMove.push(uid);
                        messageTable.push([
                            uid || '-', 
                            new Date(message.internalDate).toLocaleString() || '-' ,
                             message.envelope.subject || '-', 'yes', 'yes', (transaction.amount*.01).toFixed(2)|| '-', transaction.payee_name, message.envelope.from[0].address || '-'
                        ]);
                    } else {
                        messageTable.push([
                            uid || '-', new Date(message.internalDate).toLocaleString(), message.envelope.subject, 'no', 'yes', '-',  '-',  '-',  message.envelope.from[0].address
                        ]);
                        messageMove.push(uid);
                    }
                } else {
                    
                    messageTable.push([
                        uid, '-','-', 'no', 'no', '-',  '-',  '-',  '-'
                    ]);
                    
                }
            } catch (error) {
                console.error({ uid }, 'Error fetching email UID:', error);
            }
        }
        block.start('Email Log');
        block.blockHeader(messages.length + ' messages');
        console.log(messageTable.toString());
        block.blockFooter();
         let move = await client.messageMove(messageMove, 'TransactionAdded', {uid: true} );
        console.log(`Moved ${move.uidMap.size} messages`);
    } catch (error) {
        
        console.error('Error fetching or parsing emails:', error);
    } finally {
        await client.logout();
    }
    
    return messages;

   
}

 

function parseEmailToTransaction(email, accountMappings) {
    // Determine the corresponding account using the sender email
    
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

   

    // Apply regex parsing rules from accountMapping to extract transaction details
    let isOutflow = new RegExp(accountMapping.transactionRegex).test(email.envelope.subject);
    let isNotClear = new RegExp(accountMapping.pendingRegex)?.test(email.envelope.subject);
    let merchantRegex = new RegExp(accountMapping.merchantRegex);
    let merchantMatch = emailText.match(merchantRegex);
    let merchant = "";
    if (merchantMatch){
    merchant = merchantMatch[0];}
    else{ 
        merchant = accountMapping.accountName

    }
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

