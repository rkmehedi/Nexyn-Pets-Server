## Nexyn Pet House - Server Side

This is the backend server for the Nexyn Pet House project, a full-stack MERN application for pet adoption. The server is built with Node.js and Express.js, providing a complete RESTful API for all platform functionalities. It integrates with MongoDB for the database and is secured with JSON Web Tokens (JWT) and role-based access control.

## NB: This project was created for a Programming Hero assignment.

## Features:

- User Authentication: Secure user registration and login with JWT generation.
- Role-Based Authorization: Middleware to verify admin users for protected routes.
- Complete CRUD Operations: Full create, read, update, and delete functionalities for ( Pets , Donation Campaigns , Adoption Requests).
- Stripe Integration: Securely create payment intents for processing donations.
- Advanced Security: Includes helmet for securing HTTP headers and a strict CORS policy to only allow requests from the approved frontend URL.
- MongoDB Integration: All data is stored and managed in a MongoDB database.
-Secure Configuration: Uses .env files to protect all sensitive credentials and API keys.

## Backend Technologies & NPM Packages Used:

 - Node.js
 - Express.js
 - MongoDB
 - jsonwebtoken (JWT)
 - cors
 - dotenv
 - helmet
 - stripe

## The server for this project is securely hosted on Vercel.

Thank you!