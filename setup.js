
const {prompt} = require('enquirer');
const {consola, CreateConsola} = require('consola');
const api = require('@actual-app/api');
var prettyjson = require('prettyjson');

consola.wrapConsole();

let _emailAddress
let _emailPassword
let _budgetId
let _budgetEncryption
let _serverUrl
let _serverPassword
let _sendNotes


consola.info('enquirer, and API modules loaded.');

const questions = ([{
  type: 'input',
  name: 'serverUrl',
  initial: getServerUrl(),
  message: 'Enter your ActualBudget Server URL:',
},
{
  type: 'password',
  name: 'serverPassword',
  initial: getServerPassword(),
  message: 'Enter your ActualBudget Server Password:',
  mask:  '*'

},
{
  type: 'input',
  name: 'budgetId',
  inital: getBudgetId(),
  message: 'Enter your ActualBudget Sync ID:'
},
{
  type: 'input',
  name: 'budgetEncryption',
 initial: getBudgetEncryption(),
  message: 'Enter your ActualBudget Budget Encryption Password:'
},
{
  type: 'toggle',
  name: 'sendNotes',
  message: 'Overwrite acct notes with date of last import each run?:',
  enabled: 'yep',
  disabled: 'nope'
},
{
  type: 'number',
  name: 'numberOfAccounts',
  message: 'How many accounts will you be importing transactions for?',
  validate: value => value > 0 ? true : 'Please enter at least one account.'
},

{
  type: 'input',
  name: 'emailAddress',
  message: 'Enter your Fastmail email address:',
},
{
  type: 'password',
  name: 'emailPassword',
  message: 'Enter your Fastmail app-specific password:',
  mask: '*',
},
]
);
async function getAccountDetails(numberOfAccounts) {
  let accountDetails = [];

  for (let i = 0; i < numberOfAccounts; i++) {
    console.info(`\nEntering details for account ${i + 1}:\n`);
    const details = await prompt([
      {
        type: 'text',
        name: 'accountName',
        message: 'Enter the name or identifier for this account:',
      },
      {
        type: 'text',
        name: 'actualAccountId',
        message: 'Enter the corresponding Actual account ID:',
      },
      {
        type: 'text',
        name: 'SenderEmails',
        message: 'Enter the sender emails for account udpates:',
      },
      {
        type: 'text',
        name: 'transactionRegex',
        message: 'Enter the regex pattern to identify transactions within emails for this account:',
        result: val => val.replace(/\\(?![/bfnrtu"\\])/g, "\\\\"),
      },
      {
        type: 'text',
        name: 'merchantRegex',
        message: 'Enter the regex pattern to identify merchants within emails for this account:',
        
      },
      {type: 'text',
        name: 'pendingRegex',
        message: 'Enter the regex pattern to identify pending or authorized transactions within emails for this account:',
        
      },
      {
        type: 'text',
        name: 'AmountRegex',
        message: 'Enter the regex pattern to identify amounts within emails for this account:',
        
      },
      // Include other regex patterns as needed (deposit, payment, authorization)
    ]
    );
    
    accountDetails.push(details);
  }

  return accountDetails;
}

function getServerPassword () {
  return _serverPassword
}

function getServerUrl () {
  return _serverUrl
}

function getBudgetId () {
  return _budgetId
}

function getBudgetEncryption () {
  return _budgetEncryption
}

function getSendNotes () {
  return _sendNotes
}

async function initialSetup(emailAddress, emailPassword, budgetId, budgetEncryption, serverUrl, serverPassword, sendNotes) {
  console.log('Initiating setup...');  
  _emailAddress = emailAddress;
  _emailPassword = emailPassword;
  _budgetId = budgetId;
  _budgetEncryption = budgetEncryption;
  _serverUrl = serverUrl;
  _serverPassword = serverPassword;
  _sendNotes = sendNotes;
  
  const baseSetup = await prompt(questions);
  
  console.info('User input received: ', prettyjson.render(baseSetup));
   if (baseSetup.numberOfAccounts) {
    const accountDetails = await getAccountDetails(baseSetup.numberOfAccounts);
    console.info('Account details collected:', prettyjson.render(accountDetails));
    const linkedAccounts = accountDetails.map(details => details.actualAccountId);
    // Add the account details to the baseSetup object
    baseSetup.accountDetails = accountDetails;
    baseSetup.linkedAccounts = linkedAccounts;
    console.log('Linked accounts:', linkedAccounts);
  }
  return baseSetup;
}




async function initialize(config = [], overwriteExistingConfig = true) {
  if (!_serverUrl || overwriteExistingConfig) {
    if(config.serverUrl) {
      _serverUrl = config.serverUrl;
      console.log('Updated Actual Config: serverUrl')
    } else {
      throw new Error('Actual Budget Error: serverUrl is required');
    }
  }
  if (!_serverPassword || overwriteExistingConfig) {
    if(config.serverPassword) {
      _serverPassword = config.serverPassword;
      console.log('Updated Actual Config: serverPassword')
    } else {
      throw new Error('Actual Budget Error: serverPassword is required');
    }
  }
  if (!_budgetId || overwriteExistingConfig) {
    if(config.budgetId) {
      _budgetId = config.budgetId;
      console.log('Updated Actual Config: budgetId')
    } else {
      throw new Error('Actual Budget Error: budgetId is required');
    }
  }
  if (!_budgetEncryption || overwriteExistingConfig) {
    _budgetEncryption = config.budgetEncryption
    console.log('Updated Actual Config: budgetEncryption')
  }

  if (!_sendNotes || overwriteExistingConfig) {
    _sendNotes = config.sendNotes
    console.log('Updated Actual Config: sendNotes')
  }

  console.log('Initializing Actual Budget...');

  const { mkdir } = require('fs').promises;

  budgetspath = __dirname+'/budgets'

  try {
    await mkdir(budgetspath);
  } catch (e) {}

  try {
    await api.init({
      dataDir: budgetspath,
      serverURL: actualConfig.serverUrl || _serverUrl,
      password: actualConfig.serverPassword || _serverPassword,
    });

    let id = actualConfig.budgetId || _budgetId;
    let budgetEncryption = actualConfig.budgetEncryption || _budgetEncryption;

    await api.downloadBudget(id,  {password: budgetEncryption});
  } catch (e) {
    throw new Error(`Actual Budget Error: ${e.message}`);
  }
  console.log('Actual Budget initialized.');
  return api;
}

console.log('Setup module loaded.');

module.exports = { initialSetup, initialize }
