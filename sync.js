
const emailUpdates = require('./emailupdates');
const api = require('@actual-app/api');
const actualInjected = require('@actual-app/api/dist/injected');



let _linkedAccounts;
let _serverUrl;
let _serverPassword;
let _budgetId;
let _budgetEncryption;
let _sendNotes;

async function sync(allTransactions) {
  const { mkdir } = require('fs').promises;
  const budgetsPath = __dirname + '/budgets';
  const currentAccounts = [];
    try {
    await mkdir(budgetsPath, { recursive: true }); // Will not throw an error if the directory already exists
    console.log('Budgets directory is ready.');
  } catch (e) {
    console.error('Error preparing budgets directory:', e.message);
    throw e; // Re-throwing the error is important only if you want the script to stop execution here
  }
  // Group transactions by accountId
const transactionsByAccountId = allTransactions.reduce((acc, transaction) => {
  
  // Check if the accountId key already exists, if not initialize it
  if (!acc[transaction.account]) {
    acc[transaction.account] = [];
    currentAccounts.push(transaction.account);
  }

  // Push the transaction into the correct accountId bucket
  acc[transaction.account].push(transaction);
  return acc;
}, {});

  await api.init({
    dataDir: budgetsPath,
    serverURL: _serverUrl,
    password: _serverPassword,
  });

  console.log('Downloading budget');
  try {
    await api.downloadBudget(_budgetId, {password: _budgetEncryption});
  } catch (e) {
    console.error('Error downloading budget:', e.message);
    throw e;
  }
  console.log('Budget downloaded');
  
  const allAccounts = await api.getAccounts();
  
  console.log('_____________________________________________________')
  console.log('|          Account          |   Added   |  Updated  |')
  console.log('+---------------------------+-----------+-----------+')
  for (const accountId of currentAccounts) {
    
    try { 
      const account = (allAccounts.find(f => f.id === accountId));
      if (!account) {
        console.error(`Account ID ${accountId} not found.`);
        continue;
      }
      const accountName = account.name;

      const importedTransactions = await api.importTransactions(accountId, transactionsByAccountId[accountId]);
      console.log(`| ${accountName.padEnd(25)} | ${importedTransactions.added.length.toString().padStart(9)} | ${importedTransactions.updated.length.toString().padStart(9)} |`);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      // Assuming _sendNotes is a flag that decides if notes should be added
      if (_sendNotes == true) {
        for (const accountId of Object.keys(transactionsByAccountId)) {
          // Prompt for a custom note for the account
          const addCustomNote = await new Promise(resolve => {
            readline.question(`Add custom note for account ${accountId}: `, (answer) => {
              resolve(answer.trim());
            });
          });
      
          // Construct the note with the custom message if provided
          const noteId = 'account-' + accountId;
          let accountNote = "Transactions synced at " + new Date().toLocaleString() + " via sync spreadsheet";
          if (addCustomNote) {
            accountNote = "Note: " + addCustomNote + ". " + accountNote;
          }
      
          // Save the note using Actual API
          await actualInjected.send('notes-save', { id: noteId, note: accountNote });
        }
        
        readline.close();
      }
    } catch (ex) {
      console.error('Error importing transactions:', ex);
      throw ex;
    }
  }

  console.log('Re-downloading budget to force sync.');
  try {
    await api.downloadBudget(_budgetId, {password: _budgetEncryption});
  } catch (e) {
    console.error('Error re-downloading budget:', e.message);
    throw e;
  }

  await api.shutdown();
}

async function run(budgetId, budgetEncryption, linkedAccounts, transactions, serverUrl, serverPassword, sendNotes) {
  _linkedAccounts = linkedAccounts;
  _serverUrl = serverUrl;
  _serverPassword = serverPassword;
  _budgetId = budgetId;
  _budgetEncryption = budgetEncryption;
  _sendNotes = sendNotes;

  if (!_serverUrl || !_serverPassword) {
    throw new Error('Server URL or password not set');
  } else {
    console.log('Server information set');


  console.log(`Budget ID: ${budgetId}`);

  try {
    const allTransactions = await emailUpdates.fetchAndParseEmails();
    if (allTransactions.length > 0) {
        console.log(`Fetched ${allTransactions.length} transactions from emails.`);
        await sync(allTransactions);
    } else {
        console.log('No new transactions fetched.');
    }
} catch (error) {
    console.error('Failed to fetch transactions from emails:', error);
}
   // Pass the fetched transactions here
   
   console.log('Sync complete');
}
}
module.exports = { run };
