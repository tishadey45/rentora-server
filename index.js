import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb"


const app = express()
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express());

const uri = process.env.MONGODB_URI;
console.log(uri);
const client = new MongoClient(uri,{
    serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
connectToMongoDB();

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})