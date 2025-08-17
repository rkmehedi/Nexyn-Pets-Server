const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(helmet());
const corsOptions = {
  origin: [


    'https://a12rkmehedi.netlify.app',
    // 'http://localhost:5173',
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.a85vji0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const usersCollection = client.db("NexynPetHouseDB").collection("users");
    const petsCollection = client.db("NexynPetHouseDB").collection("pets");
    const adoptionsCollection = client.db("NexynPetHouseDB").collection("adoptions");
    const donationsCollection = client.db("NexynPetHouseDB").collection("donations");
    const paymentsCollection = client.db("NexynPetHouseDB").collection("payments");

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });


    app.patch('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const updatedData = req.body;
      const filter = { email: email };
      const updateDoc = {
        $set: {
          name: updatedData.name,
          phone: updatedData.phone,
          address: updatedData.address,

        }
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const user = await usersCollection.findOne({ email });
      res.send({ admin: user?.role === 'admin' });
    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'admin' } }
      );
      res.send(result);
    });

     app.get('/pets', async (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 9;
        const skip = page * limit;
        
        let query = { adopted: { $ne: true } };
        if (req.query.category) query.petCategory = req.query.category;
        if (req.query.search) query.petName = { $regex: req.query.search, $options: 'i' };

        const sortBy = req.query.sortBy || 'dateAdded';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder;

        const pets = await petsCollection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray();
        const total = await petsCollection.countDocuments(query);
        res.send({ pets, total, currentPage: page, totalPages: Math.ceil(total / limit) });
    });



    app.get('/admin/donations', verifyToken, verifyAdmin, async (req, res) => {
      const result = await donationsCollection.find().sort({ createdDate: -1 }).toArray();
      res.send(result);
    });

    app.get('/admin/pets', verifyToken, verifyAdmin, async (req, res) => {
      const result = await petsCollection.find().toArray();
      res.send(result);
    });
    app.get('/user/stats/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const petsAdded = await petsCollection.countDocuments({ ownerEmail: email });
      const campaignsCreated = await donationsCollection.countDocuments({ ownerEmail: email });

      const donationsMadeResult = await paymentsCollection.aggregate([
        { $match: { donatorEmail: email } },
        {
          $group: {
            _id: null,
            totalDonated: { $sum: '$donationAmount' }
          }
        }
      ]).toArray();

      const totalDonated = donationsMadeResult.length > 0 ? donationsMadeResult[0].totalDonated : 0;

      res.send({
        petsAdded,
        campaignsCreated,
        totalDonated
      });
    });

     app.get('/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
        const users = await usersCollection.countDocuments();
        const pets = await petsCollection.countDocuments();
        const donationsResult = await donationsCollection.aggregate([
            { $group: { _id: null, totalDonations: { $sum: '$donatedAmount' } } }
        ]).toArray();
        const totalDonations = donationsResult.length > 0 ? donationsResult[0].totalDonations : 0;
        res.send({ users, pets, totalDonations });
    });


    app.patch('/adoptions/accept/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { petId } = req.body;
      const filter = { _id: new ObjectId(id) };
      const adoptionRequest = await adoptionsCollection.findOne(filter);

      if (adoptionRequest.petOwnerEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const updateRequest = { $set: { status: 'accepted' } };
      await adoptionsCollection.updateOne(filter, updateRequest);

      const filterPet = { _id: new ObjectId(petId) };
      const updatePet = { $set: { adopted: true } };
      const result = await petsCollection.updateOne(filterPet, updatePet);

      res.send(result);
    });

    app.patch('/adoptions/reject/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const adoptionRequest = await adoptionsCollection.findOne(filter);

      if (adoptionRequest.petOwnerEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const updateDoc = { $set: { status: 'rejected' } };
      const result = await adoptionsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    app.get('/pets/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Invalid ID format' });
      const result = await petsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/pets/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { ownerEmail: email };
      const result = await petsCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/pets', verifyToken, async (req, res) => {
      const pet = req.body;
      pet.dateAdded = new Date();
      pet.adopted = false;
      const result = await petsCollection.insertOne(pet);
      res.send(result);
    });

    app.patch('/pets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const result = await petsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: data }
      );
      res.send(result);
    });

    app.delete('/pets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const pet = await petsCollection.findOne({ _id: new ObjectId(id) });
      const user = await usersCollection.findOne({ email: req.decoded.email });
      if (pet.ownerEmail !== req.decoded.email && user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch('/adoptions/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const adoption = await adoptionsCollection.findOne({ _id: new ObjectId(id) });
      if (!adoption) {
        return res.status(404).send({ message: 'Adoption request not found' });
      }

      const user = await usersCollection.findOne({ email: req.decoded.email });
      if (adoption.petOwnerEmail !== req.decoded.email && user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const result = await adoptionsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send(result);
    });

    app.patch('/pets/adopt/:id', verifyToken, async (req, res) => {
      const petId = req.params.id;
      const { adopted } = req.body;
      const userEmail = req.decoded.email;

      try {
        const pet = await petsCollection.findOne({ _id: new ObjectId(petId) });
        if (!pet) {
          return res.status(404).send({ message: 'Pet not found' });
        }

        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
          return res.status(401).send({ message: 'Unauthorized' });
        }

        const isOwner = pet.ownerEmail === userEmail;
        const isAdmin = user.role === 'admin';

        if (!isOwner && !isAdmin) {
          return res.status(403).send({ message: 'Forbidden: Not allowed to update this pet' });
        }

        const result = await petsCollection.updateOne(
          { _id: new ObjectId(petId) },
          { $set: { adopted: adopted } }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Internal server error' });
      }
    });


    app.post('/adoptions', verifyToken, async (req, res) => {
      const adoption = req.body;
      const exists = await adoptionsCollection.findOne({
        petId: adoption.petId,
        userEmail: adoption.userEmail
      });
      if (exists) {
        return res.status(400).send({ message: 'You have already requested to adopt this pet.' });
      }
      const result = await adoptionsCollection.insertOne(adoption);
      res.send(result);
    });

    app.get('/adoptions/check', verifyToken, async (req, res) => {
      const { petId, email } = req.query;
      const exists = await adoptionsCollection.findOne({ petId, userEmail: email });
      res.send({ hasRequested: !!exists });
    });

    app.get('/adoptions/:email', verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) return res.status(403).send({ message: 'forbidden access' });
      const result = await adoptionsCollection.find({ petOwnerEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.post('/donations', verifyToken, async (req, res) => {
      const campaign = req.body;
      campaign.createdDate = new Date();
      campaign.donatedAmount = 0;
      campaign.isPaused = false;
      const result = await donationsCollection.insertOne(campaign);
      res.send(result);
    });

    app.patch('/donations-edit/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const campaign = await donationsCollection.findOne({ _id: new ObjectId(id) });
      if (!campaign) return res.status(404).send({ message: 'Campaign not found' });

      const user = await usersCollection.findOne({ email: req.decoded.email });

      if (campaign.ownerEmail !== req.decoded.email && user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const result = await donationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      res.send(result);
    });

    app.delete('/admin/donations/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationsCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/donations', async (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 9;
        const skip = page * limit;
        
        const sortBy = req.query.sortBy || 'lastDateOfDonation';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder;

        const campaigns = await donationsCollection.find().sort(sortOptions).skip(skip).limit(limit).toArray();
        const total = await donationsCollection.countDocuments();
        res.send({ campaigns, total, currentPage: page, totalPages: Math.ceil(total / limit) });
    });


    app.get('/donations/user/:email', verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) return res.status(403).send({ message: 'forbidden access' });
      const result = await donationsCollection.find({ ownerEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.get('/donations/donators/:id', verifyToken, async (req, res) => {
      const result = await paymentsCollection.find({ campaignId: new ObjectId(req.params.id) }).toArray();
      res.send(result);
    });

    app.patch('/donations/pause/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { isPaused } = req.body;
      const campaign = await donationsCollection.findOne({ _id: new ObjectId(id) });
      const user = await usersCollection.findOne({ email: req.decoded.email });
      if (campaign.ownerEmail !== req.decoded.email && user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await donationsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { isPaused } });
      res.send(result);
    });

    app.get('/donations/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Invalid ID format' });
      const result = await donationsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch('/donations/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { donationAmount, donatorName, donatorEmail } = req.body;

      const filter = { _id: new ObjectId(id) };
      const campaign = await donationsCollection.findOne(filter);
      if (!campaign) return res.status(404).send({ message: 'Campaign not found' });
      if (campaign.isPaused) return res.status(403).send({ message: 'This campaign is currently paused.' });

      await donationsCollection.updateOne(filter, {
        $inc: { donatedAmount: parseFloat(donationAmount) }
      });

      const paymentRecord = {
        campaignId: new ObjectId(id),
        donatorName,
        donatorEmail,
        donationAmount: parseFloat(donationAmount),
        date: new Date()
      };
      const result = await paymentsCollection.insertOne(paymentRecord);
      res.send(result);
    });

    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { amount } = req.body;
      const amountInCents = parseInt(amount * 100);
      if (amountInCents < 50) {
        return res.status(400).send({ message: 'Amount must be at least $0.50' });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) return res.status(403).send({ message: 'forbidden access' });
      const result = await paymentsCollection.aggregate([
        { $match: { donatorEmail: email } },
        {
          $lookup: {
            from: 'donations',
            localField: 'campaignId',
            foreignField: '_id',
            as: 'campaignDetails'
          }
        },
        { $unwind: '$campaignDetails' },
        {
          $project: {
            _id: 1,
            donationAmount: 1,
            date: 1,
            petName: '$campaignDetails.petName',
            petImage: '$campaignDetails.petImage',
            campaignId: '$campaignDetails._id'
          }
        }
      ]).toArray();
      res.send(result);
    });

    app.delete('/payments/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = await paymentsCollection.findOne({ _id: new ObjectId(id) });
      if (!payment) return res.status(404).send({ message: 'Donation not found.' });

      const user = await usersCollection.findOne({ email: req.decoded.email });
      if (payment.donatorEmail !== req.decoded.email && user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      await donationsCollection.updateOne(
        { _id: payment.campaignId },
        { $inc: { donatedAmount: -payment.donationAmount } }
      );
      const result = await paymentsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

  } finally {
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Nexyn Pet House Server is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
