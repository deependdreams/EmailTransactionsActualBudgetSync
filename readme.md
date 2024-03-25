Sync email transaction notifications to [ActualBudget](https://actualbudget.org/).

This is a very drafty script concept borrowing heavily from  [simplefin actual sync script](https://github.com/duplaja/actual-simplefin-sync) as well as [this script for parsing transactions emails into a spreadsheet](https://github.com/jrbromberg/bank-emails-to-spreadsheet/tree/add-bofa), with some support from chatGPT. 



## Preparing to run the script
  - Create the credentials to access your email inbox via imap 
    - my script thus far uses fastmail, where you just create an app specific password to share in set up
    - You probably can modify to provide whatever credentials.
  - The [ActualBduget Budget ID](https://actualbudget.com/docs/developers/using-the-API/#getting-started) is required during **setup**
  - ActualBudget needs to be installed and running
    - the server url is literally the url you type in (whether local or not local)
    - You'll need the actual account id's for each account you want to sync this way.
  - In your email create two folders one called BankTransactionUpdate and one called TransactionAdded
    - when the script runs it will check for valid transactions in the update folder and move successfully parsed transaction emails into the Transaction added folder.
    - create filters to move emails into the update folder as appropriate.
  - Once you get everything running, you may (optionally) configure a system cron to run this automatically.

### Regex Prep
- When you run the set up script, you'll be prompted to provided the email address, payee identication regular expression, amount regular expression, pending identification regular expression, outflow identification regular expresssion(as opposed to inflow/deposit), and actual account id for each account you want to sync this way.
- You'll probably want to spend sometime in a tool like [Regexer](https://regexr.com/) figuring this out.
    - Parsing into the config.json from the prompt can be a bit wonky right now (particuarlly it escapes'\n 'to '\\n' etc)

## Other notes
 - Future runs start from 5 days prior to the previous run, to catch any that processed later. No duplicate transactions will be created in Actual.
 - You can reset all your settings by deleting the config.json file, and the budget folder, if you wish. This will not delete previous transactions from Actual.

## Future Directions and ideas
 - Pretty formatting and running of the app in the terminal
 - show emails that don't parse in the terminal?
 - Show parsed transactions, per account, in table prior to syncing? allow data correction/confirmation?
 - figure out how to make the notes work? 
 - fix json parsing/storage 
 - validation of expressions and info in the set up process?
 - dynamic determination of email bodystructure to target the right one for the plaintext. Right now it always parses the first part of the body, with some code to determine whether it's plain or plain/html and the encoding.
 - make the imap interaction display return prettier?
 
## USAGE
  - **Sync** - If the app hasn't been configured yet, you'll be run through the setup steps, otherwise it will sync the current month for all accounts. 
    ```
    node app.js
    ```

  - **Setup** - Rerun set up. 
    ```
    node app.js --setup
    ```

    
