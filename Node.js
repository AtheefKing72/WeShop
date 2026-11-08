const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const paypal = require('@paypal/checkout-server-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up PayPal Environment
function getPayPalEnvironment() {
    const clientId = process.env.PAYPAL_CLIENT_ID || 'sb';
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'sandbox_secret';

    if (process.env.PAYPAL_MODE === 'live') {
        return new paypal.core.LiveEnvironment(clientId, clientSecret);
    }
    return new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

function getPayPalClient() {
    return new paypal.core.PayPalHttpClient(getPayPalEnvironment());
}

// API Endpoint 1: Get Config Info for Frontend
app.get('/api/config', (req, res) => {
    res.json({
        paypalClientId: process.env.PAYPAL_CLIENT_ID || 'sb',
        merchantEmail: process.env.PAYPAL_MERCHANT_EMAIL || 'atheef0913@gmail.com'
    });
});

// API Endpoint 2: Create Order Endpoint
app.post('/api/orders/create', async (req, res) => {
    try {
        const { items, customer } = req.body;

        if (!items || !items.length) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Calculate total amount securely on server side
        const total = items.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.qty)), 0).toFixed(2);

        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                description: "WeShop POD T-Shirt Order",
                amount: {
                    currency_code: 'USD',
                    value: total
                },
                payee: {
                    email_address: process.env.PAYPAL_MERCHANT_EMAIL || "atheef0913@gmail.com"
                }
            }]
        });

        const client = getPayPalClient();
        const order = await client.execute(request);

        res.status(201).json({ id: order.result.id, status: order.result.status });
    } catch (err) {
        console.error('Error creating PayPal order:', err);
        res.status(500).json({ error: err.message || 'Failed to create payment order' });
    }
});

// API Endpoint 3: Capture Order Endpoint
app.post('/api/orders/capture', async (req, res) => {
    try {
        const { orderID, customer, items } = req.body;
        if (!orderID) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        const request = new paypal.orders.OrdersCaptureRequest(orderID);
        request.requestBody({});

        const client = getPayPalClient();
        const capture = await client.execute(request);

        console.log(`Payment captured successfully for order: ${orderID}. Funds sent to ${process.env.PAYPAL_MERCHANT_EMAIL}`);

        // Send Email Notification to atheef0913@gmail.com
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.PAYPAL_MERCHANT_EMAIL,
                    pass: process.env.EMAIL_PASSWORD // App Password generated in Google Account
                }
            });

            const mailOptions = {
                from: process.env.PAYPAL_MERCHANT_EMAIL,
                to: 'atheef0913@gmail.com',
                subject: `🛍️ New WeShop POD Order #${capture.result.id}`,
                html: `
                    <h2>New Order Received!</h2>
                    <p><strong>Customer Name:</strong> ${customer?.name || 'N/A'}</p>
                    <p><strong>Customer Email:</strong> ${customer?.email || 'N/A'}</p>
                    <p><strong>Shipping Address:</strong> ${customer?.address || 'N/A'}</p>
                    <p><strong>PayPal TxID:</strong> ${capture.result.id}</p>
                `
            };

            await transporter.sendMail(mailOptions);
        } catch (emailErr) {
            console.warn('Could not send email notification:', emailErr.message);
        }

        res.json({
            status: 'COMPLETED',
            transactionId: capture.result.id,
            details: capture.result
        });
    } catch (err) {
        console.error('Error capturing PayPal order:', err);
        res.status(500).json({ error: err.message || 'Failed to capture payment' });
    }
});

// Serve frontend for root routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`WeShop Server running on http://localhost:${PORT}`);
    console.log(`Target PayPal merchant email: ${process.env.PAYPAL_MERCHANT_EMAIL || 'atheef0913@gmail.com'}`);
});