const PORT = 8000;
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');

const app = express();
dotenv.config();

app.use(cors({ origin: '*' }));
app.use(express.static("."));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


//Recieves a validation request from the plugin
app.post('/validate', async (request, response) => {
  const txInfo = request.body;

  if (await validateTXHandler(txInfo)) {
    response.status(202).send('Transaction is valid');
  }
  else {
    response.status(402).send('Transaction is not valid');
  }
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});


//=========================== EFFECTUATORS =================================
const validateTXHandler = async (txInfo) => {
  const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@deropay.7rmohib.mongodb.net/?retryWrites=true&w=majority`;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    let isTXValid = await validateTX(txInfo);
    if(isTXValid){
      await saveTX(client, txInfo)
    }
    else{
      console.log('Transaction is not valid');
      return false;
    }
  }
  catch (err) {
    console.log(err);
    return false;
  }
  finally {
    await client.close();
    return true;
  }
}

//Validates the transaction & stores it in the database
const validateTX = async (txInfo) => {
  const transactionID = txInfo.txid;
  const transactionProof = txInfo.txProof;
  const transactionAmount = txInfo.DEROPrice;
  const transactionAddress = txInfo.destinationWalletAddress;

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
  });
  const page = await browser.newPage();
  await page.goto(`https://explorer.dero.io/tx/${transactionID}`, {waitUntil: "networkidle2"});
  const submitButton = await page.$x('/html/body/div[2]/div[2]/table/tbody/tr[3]/td/form/input[3]');
  await page.waitForSelector('input[name=txproof]');
  await page.$eval('input[name=txproof]', (el, value) => el.value = value, transactionProof);
  submitButton[0].click();
  await page.waitForSelector('font');
  let result = await page.$('font');
  let value = await result.evaluate(el => el.textContent);

  console.log(value);

  await browser.close();


  let txStatus = value.slice(0, 128);
  console.log(txStatus);
  let DEROSent = parseFloat(txStatus.split(' ')[2]);
  console.log(DEROSent);
  let DEROAddress = txStatus.split(' ')[0];

  
  if (DEROSent == undefined) {
    console.log('Transaction not found');
    return false;
  }
  else if (DEROSent != transactionAmount) {
    console.log('Transaction amount is not valid');
    return false;
  }
  else if (DEROSent == transactionAmount && DEROAddress == transactionAddress) {
    console.log('Transaction is valid');
    return true;
  }
}

const saveTX = async (client, txInfo) => {
  const result = await client.db('DEROPay').collection('TXs').insertOne(txInfo);

  console.log(`New TX Created: ${result.insertedId}`);
}