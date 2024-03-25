const {prompt} = require('enquirer');
const { createConsola } = require("consola");
const setup = require('./setup');
const sync = require('./sync');
const nconf = require('nconf');
const api = require('@actual-app/api');
const fsExtra = require('fs-extra');

const consola = createConsola({
  // level: 4,
  fancy: true 
});
consola.wrapConsole();

const {
  initialize,
} = require("./setup.js");

nconf.argv().env().file({ file: './config.json' })

let actualInstance

async function run () {
  let emailAddress = nconf.get('emailAddress')
  let emailPassword = nconf.get('emailPassword')
  let budgetId = nconf.get('actual:budgetId')
  let budgetEncryption = nconf.get('actual:budgetEncryption') || ''
  let serverUrl = nconf.get('actual:serverUrl') || ''
  let serverPassword = nconf.get('actual:serverPassword') || ''
  let sendNotes = nconf.get('actual:sendNotes') || ''
  let serverValidated = nconf.get('actual:serverValidated') || ''
  let linkedAccounts = nconf.get('linkedAccounts') || []
  let accountDetails = nconf.get('accountDetails') || []


  const setupRequired = !!nconf.get('setup') || !emailAddress || !budgetId || !serverUrl || !serverPassword || !serverValidated
  const linkRequired = setupRequired || !!nconf.get('link') || !linkedAccounts || !accountDetails

  if (setupRequired) {
    const initialSetup = await setup.initialSetup(emailAddress, emailPassword, budgetId, budgetEncryption, serverUrl, serverPassword)

    emailAddress = initialSetup.emailAddress
    emailPassword = initialSetup.emailPassword
    budgetId = initialSetup.budgetId
    budgetEncryption = initialSetup.budgetEncryption
    serverUrl = initialSetup.serverUrl
    serverPassword = initialSetup.serverPassword
    sendNotes = initialSetup.sendNotes
    accountDetails = initialSetup.accountDetails

    nconf.set('emailAddress', emailAddress)
    nconf.set('emailPassword', emailPassword)
    nconf.set('actual:budgetId', budgetId)
    nconf.set('actual:budgetEncryption', budgetEncryption)
    nconf.set('actual:serverUrl', serverUrl)
    nconf.set('actual:serverPassword', serverPassword)
    nconf.set('actual:sendNotes', sendNotes)
    nconf.set('accountDetails', accountDetails)

    await nconf.save()

    actualConfig = {
      budgetId: budgetId,
      budgetEncryption: budgetEncryption,
      serverUrl: serverUrl,
      serverPassword: serverPassword
    }

    if (!actualInstance) {
      actualInstance = await initialize(actualConfig);
    }


    console.log('Budget: ', budgetId);

    await actualInstance.downloadBudget(budgetId, {password: budgetEncryption});

    accounts = await actualInstance.getAccounts();

    if(accounts.length <= 0) {

      throw new Error('Be sure that your Actual Budget URL and Server are set correctly, that your Budget has at least one created Account. ');

    }

    nconf.set('actual:serverValidated', 'yes')

    await nconf.save()

  }

  if (linkRequired) {
    actualConfig = {
      budgetId: budgetId,
      budgetEncryption: budgetEncryption,
      serverUrl: serverUrl,
      serverPassword: serverPassword
    }

    if (!actualInstance) {
      actualInstance = await initialize(actualConfig);
    }


    nconf.set('linkedAccounts', linkedAccounts)
    nconf.save()
  }

  if(actualInstance) {
    await actualInstance.shutdown()
  }

  const lastSync = nconf.get('lastSync')
  let startDate
  if (lastSync) {
    // Looking back an additional 5 days, this may not be necessary, just trying to make sure we catch any additional 'older' transactions that may have slipped in after our last check.
    startDate = new Date(lastSync)
    startDate.setDate(startDate.getDate() - 5)
  }

  budgetspath = __dirname+'/budgets';
  fsExtra.emptyDirSync(budgetspath);

  await sync.run(budgetId, budgetEncryption, linkedAccounts, startDate, serverUrl, serverPassword, sendNotes)
  nconf.set('lastSync', new Date().toDateString())
  nconf.save()

  console.log('Clearing temporary budget files.');
  fsExtra.emptyDirSync(budgetspath);

  console.log('Complete')
  process.exit()

}

run()
