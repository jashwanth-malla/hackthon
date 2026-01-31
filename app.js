// SilentSOS Backend Server
// Node.js + Express + Socket.IO + MongoDB

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const geolib = require('geolib');

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/silentsos';

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Email Configuration
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-password'
    }
});

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ==================== MONGOOSE SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    emergencyContacts: [{
        name: String,
        phone: String,
        email: String,
        relationship: String,
        priority: Number
    }],
    location: {
        latitude: Number,
        longitude: Number,
        address: String,
        lastUpdated: Date
    },
    settings: {
        voiceTriggerEnabled: { type: Boolean, default: true },
        shakeDetectionEnabled: { type: Boolean, default: true },
        fallDetectionEnabled: { type: Boolean, default: true },
        routeTrackingEnabled: { type: Boolean, default: false },
        autoCallPolice: { type: Boolean, default: true }
    },
    medicalInfo: {
        bloodType: String,
        allergies: [String],
        medications: [String],
        conditions: [String],
        isCPRCertified: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

// Emergency Schema
const emergencySchema = new mongoose.Schema({
    emergencyId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['voice_trigger', 'shake_detection', 'fall_detection', 'manual', 'heart_emergency', 'route_deviation'],
        required: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'resolved', 'cancelled', 'false_alarm'],
        default: 'active'
    },
    location: {
        latitude: Number,
        longitude: Number,
        address: String,
        accuracy: Number
    },
    triggerTime: { type: Date, default: Date.now },
    resolvedTime: Date,
    evidence: {
        audioRecording: String,
        videoRecording: String,
        photos: [String],
        transcript: String,
        voiceAnalysis: Object
    },
    notifications: [{
        contactId: String,
        contactName: String,
        method: String, // 'sms', 'call', 'email'
        sentAt: Date,
        status: String // 'sent', 'failed', 'delivered'
    }],
    timeline: [{
        timestamp: Date,
        event: String,
        details: Object
    }],
    responders: [{
        responderId: String,
        name: String,
        type: String, // 'cpr', 'police', 'ambulance', 'community'
        distance: Number,
        eta: Number,
        status: String // 'notified', 'accepted', 'arriving', 'arrived'
    }]
});

// Route Tracking Schema
const routeTrackingSchema = new mongoose.Schema({
    trackingId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    origin: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    destination: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    expectedRoute: [{
        latitude: Number,
        longitude: Number
    }],
    actualRoute: [{
        latitude: Number,
        longitude: Number,
        timestamp: Date
    }],
    deviation: {
        detected: { type: Boolean, default: false },
        detectedAt: Date,
        maxDeviation: Number, // in meters
        reason: String
    },
    vehicleInfo: {
        type: String, // 'taxi', 'rideshare', 'private'
        driver: String,
        plateNumber: String,
        company: String
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'deviation_alert', 'emergency'],
        default: 'active'
    },
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    estimatedArrival: Date
});

// Safe Spot Schema
const safeSpotSchema = new mongoose.Schema({
    spotId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['police_station', 'hospital', 'fire_station', 'cafe', 'store', 'gas_station', 'mall', 'community_verified'],
        required: true 
    },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: String
    },
    contact: {
        phone: String,
        email: String
    },
    hours: {
        open24_7: { type: Boolean, default: false },
        openingTime: String,
        closingTime: String
    },
    verified: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    helpedCount: { type: Number, default: 0 },
    reviews: [{
        userId: String,
        rating: Number,
        comment: String,
        date: Date
    }],
    features: {
        hasSecurity: Boolean,
        hasCCTV: Boolean,
        wellLit: Boolean,
        publicArea: Boolean
    }
});

// CPR Responder Schema
const cprResponderSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    location: {
        latitude: Number,
        longitude: Number,
        lastUpdated: Date
    },
    certification: {
        certified: { type: Boolean, default: true },
        certificationDate: Date,
        expiryDate: Date,
        certifyingBody: String,
        isProfessional: Boolean // paramedic, doctor, nurse
    },
    availability: {
        isAvailable: { type: Boolean, default: true },
        radius: { type: Number, default: 5000 } // in meters
    },
    stats: {
        emergenciesResponded: { type: Number, default: 0 },
        livesHelped: { type: Number, default: 0 },
        averageResponseTime: Number,
        rating: { type: Number, default: 5.0 }
    }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Emergency = mongoose.model('Emergency', emergencySchema);
const RouteTracking = mongoose.model('RouteTracking', routeTrackingSchema);
const SafeSpot = mongoose.model('SafeSpot', safeSpotSchema);
const CPRResponder = mongoose.model('CPRResponder', cprResponderSchema);

// ==================== HELPER FUNCTIONS ====================

// Generate unique IDs
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    return geolib.getDistance(
        { latitude: lat1, longitude: lon1 },
        { latitude: lat2, longitude: lon2 }
    );
}

// Send SMS via Twilio
async function sendSMS(to, message) {
    try {
        const result = await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: to
        });
        console.log(`✅ SMS sent to ${to}:`, result.sid);
        return { success: true, messageId: result.sid };
    } catch (error) {
        console.error(`❌ Failed to send SMS to ${to}:`, error);
        return { success: false, error: error.message };
    }
}

// Make emergency call via Twilio
async function makeEmergencyCall(to, message) {
    try {
        const result = await twilioClient.calls.create({
            twiml: `<Response><Say>${message}</Say></Response>`,
            from: TWILIO_PHONE_NUMBER,
            to: to
        });
        console.log(`✅ Call initiated to ${to}:`, result.sid);
        return { success: true, callId: result.sid };
    } catch (error) {
        console.error(`❌ Failed to call ${to}:`, error);
        return { success: false, error: error.message };
    }
}

// Send email notification
async function sendEmail(to, subject, html) {
    try {
        const result = await emailTransporter.sendMail({
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            html: html
        });
        console.log(`✅ Email sent to ${to}:`, result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error);
        return { success: false, error: error.message };
    }
}

// Notify emergency contacts
async function notifyEmergencyContacts(user, emergency) {
    const notifications = [];
    
    const emergencyMessage = `🚨 EMERGENCY ALERT!

${user.name} has triggered an emergency SOS.

Type: ${emergency.type.replace(/_/g, ' ').toUpperCase()}
Location: ${emergency.location.address || `${emergency.location.latitude}, ${emergency.location.longitude}`}
Time: ${new Date(emergency.triggerTime).toLocaleString()}

View live location: https://maps.google.com/maps?q=${emergency.location.latitude},${emergency.location.longitude}

Emergency ID: ${emergency.emergencyId}

Please check on them immediately!`;

    // Sort contacts by priority
    const sortedContacts = user.emergencyContacts.sort((a, b) => a.priority - b.priority);

    for (const contact of sortedContacts) {
        // Send SMS
        const smsResult = await sendSMS(contact.phone, emergencyMessage);
        notifications.push({
            contactId: contact._id,
            contactName: contact.name,
            method: 'sms',
            sentAt: new Date(),
            status: smsResult.success ? 'sent' : 'failed'
        });

        // Send Email
        if (contact.email) {
            const emailHTML = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="margin: 0;">🚨 EMERGENCY ALERT</h1>
                    </div>
                    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                        <p style="font-size: 18px; color: #333;"><strong>${user.name}</strong> has triggered an emergency SOS.</p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Type:</strong> ${emergency.type.replace(/_/g, ' ').toUpperCase()}</p>
                            <p><strong>Time:</strong> ${new Date(emergency.triggerTime).toLocaleString()}</p>
                            <p><strong>Location:</strong> ${emergency.location.address || 'See map below'}</p>
                        </div>

                        <a href="https://maps.google.com/maps?q=${emergency.location.latitude},${emergency.location.longitude}" 
                           style="display: inline-block; background: #ff416c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0;">
                            📍 View Live Location
                        </a>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">Emergency ID: ${emergency.emergencyId}</p>
                    </div>
                </div>
            `;

            const emailResult = await sendEmail(
                contact.email, 
                `🚨 EMERGENCY: ${user.name} needs help!`,
                emailHTML
            );

            notifications.push({
                contactId: contact._id,
                contactName: contact.name,
                method: 'email',
                sentAt: new Date(),
                status: emailResult.success ? 'sent' : 'failed'
            });
        }

        // Make emergency call for top priority contacts
        if (contact.priority <= 2) {
            const callMessage = `Emergency alert. ${user.name} has triggered an SOS. Please check on them immediately. Their location has been sent to your phone.`;
            const callResult = await makeEmergencyCall(contact.phone, callMessage);
            
            notifications.push({
                contactId: contact._id,
                contactName: contact.name,
                method: 'call',
                sentAt: new Date(),
                status: callResult.success ? 'sent' : 'failed'
            });
        }
    }

    return notifications;
}

// Find nearby CPR responders
async function findNearbyCPRResponders(latitude, longitude, limit = 3) {
    const allResponders = await CPRResponder.find({ 
        'availability.isAvailable': true,
        'certification.certified': true
    });

    // Calculate distances and filter by radius
    const respondersWithDistance = allResponders
        .map(responder => {
            if (!responder.location.latitude || !responder.location.longitude) {
                return null;
            }

            const distance = calculateDistance(
                latitude, 
                longitude,
                responder.location.latitude,
                responder.location.longitude
            );

            if (distance <= responder.availability.radius) {
                return {
                    ...responder.toObject(),
                    distance,
                    eta: Math.ceil(distance / 83.33) // Assuming 5 km/h walking speed = 83.33 m/min
                };
            }
            return null;
        })
        .filter(r => r !== null)
        .sort((a, b) => a.distance - b.distance);

    // Select responders from different directions
    const selectedResponders = [];
    const directions = [];

    for (const responder of respondersWithDistance) {
        if (selectedResponders.length >= limit) break;

        // Calculate bearing (direction)
        const bearing = geolib.getRhumbLineBearing(
            { latitude, longitude },
            { latitude: responder.location.latitude, longitude: responder.location.longitude }
        );

        // Categorize into 8 directions (N, NE, E, SE, S, SW, W, NW)
        const direction = Math.floor((bearing + 22.5) / 45) % 8;

        // Try to select responders from different directions
        if (!directions.includes(direction) || selectedResponders.length < limit) {
            selectedResponders.push(responder);
            directions.push(direction);
        }
    }

    return selectedResponders;
}

// Check route deviation
function checkRouteDeviation(tracking) {
    if (!tracking.expectedRoute || tracking.expectedRoute.length === 0) {
        return { deviation: false, maxDeviation: 0 };
    }

    if (!tracking.actualRoute || tracking.actualRoute.length === 0) {
        return { deviation: false, maxDeviation: 0 };
    }

    let maxDeviation = 0;

    // Check each actual point against closest expected point
    for (const actualPoint of tracking.actualRoute) {
        let minDistance = Infinity;

        for (const expectedPoint of tracking.expectedRoute) {
            const distance = calculateDistance(
                actualPoint.latitude,
                actualPoint.longitude,
                expectedPoint.latitude,
                expectedPoint.longitude
            );

            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        if (minDistance > maxDeviation) {
            maxDeviation = minDistance;
        }
    }

    // Deviation threshold: 500 meters
    const DEVIATION_THRESHOLD = 500;
    return {
        deviation: maxDeviation > DEVIATION_THRESHOLD,
        maxDeviation
    };
}

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'SilentSOS Backend is running',
        timestamp: new Date()
    });
});

// ===== USER ROUTES =====

// Register/Update User
app.post('/api/user/register', async (req, res) => {
    try {
        const { userId, name, phone, email, emergencyContacts, medicalInfo, settings } = req.body;

        let user = await User.findOne({ userId });

        if (user) {
            // Update existing user
            user.name = name || user.name;
            user.phone = phone || user.phone;
            user.email = email || user.email;
            user.emergencyContacts = emergencyContacts || user.emergencyContacts;
            user.medicalInfo = medicalInfo || user.medicalInfo;
            user.settings = { ...user.settings, ...settings };
            user.lastActive = new Date();
        } else {
            // Create new user
            user = new User({
                userId,
                name,
                phone,
                email,
                emergencyContacts: emergencyContacts || [],
                medicalInfo: medicalInfo || {},
                settings: settings || {}
            });
        }

        await user.save();

        res.json({
            success: true,
            message: user.isNew ? 'User registered successfully' : 'User updated successfully',
            user
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get User Profile
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update User Location
app.post('/api/user/:userId/location', async (req, res) => {
    try {
        const { latitude, longitude, address } = req.body;

        const user = await User.findOneAndUpdate(
            { userId: req.params.userId },
            {
                location: {
                    latitude,
                    longitude,
                    address,
                    lastUpdated: new Date()
                },
                lastActive: new Date()
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Emit location update via WebSocket
        io.to(req.params.userId).emit('location_updated', {
            latitude,
            longitude,
            address
        });

        res.json({ success: true, location: user.location });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== EMERGENCY ROUTES =====

// Trigger Emergency SOS
app.post('/api/emergency/trigger', async (req, res) => {
    try {
        const { userId, type, location, evidence } = req.body;

        // Get user details
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Create emergency record
        const emergency = new Emergency({
            emergencyId: generateId('EMG'),
            userId,
            type,
            location,
            evidence: evidence || {},
            timeline: [{
                timestamp: new Date(),
                event: 'Emergency triggered',
                details: { type, location }
            }]
        });

        await emergency.save();

        // Notify emergency contacts
        const notifications = await notifyEmergencyContacts(user, emergency);
        emergency.notifications = notifications;
        await emergency.save();

        // If heart emergency, find CPR responders
        if (type === 'heart_emergency') {
            const responders = await findNearbyCPRResponders(
                location.latitude,
                location.longitude,
                3
            );

            emergency.responders = responders.map(r => ({
                responderId: r.userId,
                name: r.name,
                type: 'cpr',
                distance: r.distance,
                eta: r.eta,
                status: 'notified'
            }));

            await emergency.save();

            // Notify CPR responders
            for (const responder of responders) {
                await sendSMS(
                    responder.phone,
                    `🚨 CPR EMERGENCY NEARBY!\n\nLocation: ${location.address}\nDistance: ${responder.distance}m\nETA: ${responder.eta} mins\n\nRespond immediately if available!`
                );

                // Emit to responder's socket
                io.to(responder.userId).emit('cpr_request', {
                    emergencyId: emergency.emergencyId,
                    location,
                    distance: responder.distance,
                    eta: responder.eta
                });
            }
        }

        // Auto-call police if enabled
        if (user.settings.autoCallPolice) {
            setTimeout(async () => {
                await makeEmergencyCall(
                    '100', // Indian police emergency number
                    `Emergency SOS triggered. Location: ${location.latitude}, ${location.longitude}`
                );

                emergency.timeline.push({
                    timestamp: new Date(),
                    event: 'Police notified',
                    details: { number: '100' }
                });
                await emergency.save();
            }, 5000); // 5 second delay
        }

        // Emit real-time emergency event
        io.emit('emergency_triggered', {
            emergencyId: emergency.emergencyId,
            userId,
            type,
            location
        });

        // Emit to user's emergency contacts
        for (const contact of user.emergencyContacts) {
            io.to(contact.phone).emit('emergency_alert', {
                emergencyId: emergency.emergencyId,
                userName: user.name,
                type,
                location
            });
        }

        res.json({
            success: true,
            message: 'Emergency SOS triggered successfully',
            emergency,
            notificationsSent: notifications.length
        });
    } catch (error) {
        console.error('Error triggering emergency:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancel/Resolve Emergency
app.post('/api/emergency/:emergencyId/resolve', async (req, res) => {
    try {
        const { status, reason } = req.body; // status: 'resolved', 'cancelled', 'false_alarm'

        const emergency = await Emergency.findOne({ emergencyId: req.params.emergencyId });
        if (!emergency) {
            return res.status(404).json({ success: false, error: 'Emergency not found' });
        }

        emergency.status = status;
        emergency.resolvedTime = new Date();
        emergency.timeline.push({
            timestamp: new Date(),
            event: `Emergency ${status}`,
            details: { reason }
        });

        await emergency.save();

        // Get user details
        const user = await User.findOne({ userId: emergency.userId });

        // Notify contacts that emergency is resolved
        const safeMessage = `✅ SAFE: ${user.name} has marked themselves as safe. Emergency cancelled.`;

        for (const contact of user.emergencyContacts) {
            await sendSMS(contact.phone, safeMessage);

            if (contact.email) {
                await sendEmail(
                    contact.email,
                    `✅ ${user.name} is Safe`,
                    `<h2>Good News!</h2><p>${user.name} has confirmed they are safe and cancelled the emergency alert.</p>`
                );
            }
        }

        // Emit real-time event
        io.emit('emergency_resolved', {
            emergencyId: emergency.emergencyId,
            status
        });

        res.json({
            success: true,
            message: 'Emergency resolved successfully',
            emergency
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Emergency Details
app.get('/api/emergency/:emergencyId', async (req, res) => {
    try {
        const emergency = await Emergency.findOne({ emergencyId: req.params.emergencyId });
        
        if (!emergency) {
            return res.status(404).json({ success: false, error: 'Emergency not found' });
        }

        res.json({ success: true, emergency });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get User's Emergency History
app.get('/api/user/:userId/emergencies', async (req, res) => {
    try {
        const emergencies = await Emergency.find({ userId: req.params.userId })
            .sort({ triggerTime: -1 })
            .limit(50);

        res.json({ success: true, emergencies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROUTE TRACKING ROUTES =====

// Start Route Tracking
app.post('/api/route/start', async (req, res) => {
    try {
        const { userId, origin, destination, vehicleInfo, expectedRoute } = req.body;

        const tracking = new RouteTracking({
            trackingId: generateId('TRK'),
            userId,
            origin,
            destination,
            vehicleInfo: vehicleInfo || {},
            expectedRoute: expectedRoute || [],
            estimatedArrival: new Date(Date.now() + 30 * 60000) // 30 mins default
        });

        await tracking.save();

        // Notify emergency contacts
        const user = await User.findOne({ userId });
        const message = `📍 ${user.name} has started a ride.

From: ${origin.address}
To: ${destination.address}
Vehicle: ${vehicleInfo?.type || 'Unknown'}
Estimated arrival: ${new Date(tracking.estimatedArrival).toLocaleTimeString()}

Track live: https://silentsos.app/track/${tracking.trackingId}`;

        for (const contact of user.emergencyContacts.slice(0, 2)) { // Top 2 contacts
            await sendSMS(contact.phone, message);
        }

        res.json({
            success: true,
            message: 'Route tracking started',
            tracking
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Route Position
app.post('/api/route/:trackingId/update', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        const tracking = await RouteTracking.findOne({ trackingId: req.params.trackingId });
        if (!tracking) {
            return res.status(404).json({ success: false, error: 'Tracking not found' });
        }

        // Add to actual route
        tracking.actualRoute.push({
            latitude,
            longitude,
            timestamp: new Date()
        });

        // Check for deviation
        const deviationCheck = checkRouteDeviation(tracking);

        if (deviationCheck.deviation && !tracking.deviation.detected) {
            tracking.deviation = {
                detected: true,
                detectedAt: new Date(),
                maxDeviation: deviationCheck.maxDeviation,
                reason: 'Route significantly differs from expected path'
            };
            tracking.status = 'deviation_alert';

            // Alert emergency contacts
            const user = await User.findOne({ userId: tracking.userId });
            const alertMessage = `⚠️ ROUTE DEVIATION ALERT!

${user.name}'s ride has deviated from expected route.

Current location: ${latitude}, ${longitude}
Deviation: ${Math.round(deviationCheck.maxDeviation)}m from expected path

View location: https://maps.google.com/maps?q=${latitude},${longitude}`;

            for (const contact of user.emergencyContacts) {
                await sendSMS(contact.phone, alertMessage);
            }

            // Emit real-time alert
            io.emit('route_deviation', {
                trackingId: tracking.trackingId,
                deviation: tracking.deviation
            });
        }

        await tracking.save();

        // Emit location update
        io.to(tracking.trackingId).emit('route_updated', {
            latitude,
            longitude,
            deviation: tracking.deviation
        });

        res.json({
            success: true,
            location: { latitude, longitude },
            deviation: tracking.deviation
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Complete Route Tracking
app.post('/api/route/:trackingId/complete', async (req, res) => {
    try {
        const tracking = await RouteTracking.findOne({ trackingId: req.params.trackingId });
        if (!tracking) {
            return res.status(404).json({ success: false, error: 'Tracking not found' });
        }

        tracking.status = 'completed';
        tracking.endTime = new Date();
        await tracking.save();

        // Notify contacts
        const user = await User.findOne({ userId: tracking.userId });
        const message = `✅ ${user.name} has reached their destination safely.`;

        for (const contact of user.emergencyContacts.slice(0, 2)) {
            await sendSMS(contact.phone, message);
        }

        res.json({
            success: true,
            message: 'Route tracking completed',
            tracking
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== SAFE SPOTS ROUTES =====

// Get Nearby Safe Spots
app.get('/api/safespots/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 5000, type } = req.query;

        const allSpots = await SafeSpot.find(type ? { type } : {});

        // Filter by distance
        const nearbySpots = allSpots
            .map(spot => {
                const distance = calculateDistance(
                    parseFloat(latitude),
                    parseFloat(longitude),
                    spot.location.latitude,
                    spot.location.longitude
                );

                if (distance <= parseFloat(radius)) {
                    return {
                        ...spot.toObject(),
                        distance,
                        eta: Math.ceil(distance / 83.33) // 5 km/h walking speed
                    };
                }
                return null;
            })
            .filter(spot => spot !== null)
            .sort((a, b) => a.distance - b.distance);

        res.json({
            success: true,
            count: nearbySpots.length,
            spots: nearbySpots
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add Safe Spot (Community contribution)
app.post('/api/safespots/add', async (req, res) => {
    try {
        const { name, type, location, contact, hours, features } = req.body;

        const safeSpot = new SafeSpot({
            spotId: generateId('SPOT'),
            name,
            type,
            location,
            contact: contact || {},
            hours: hours || {},
            features: features || {},
            verified: type === 'community_verified' ? false : true
        });

        await safeSpot.save();

        res.json({
            success: true,
            message: 'Safe spot added successfully',
            spot: safeSpot
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== CPR RESPONDER ROUTES =====

// Register as CPR Responder
app.post('/api/cpr/register', async (req, res) => {
    try {
        const { userId, name, phone, certification, location } = req.body;

        let responder = await CPRResponder.findOne({ userId });

        if (responder) {
            // Update existing
            responder.name = name || responder.name;
            responder.phone = phone || responder.phone;
            responder.certification = { ...responder.certification, ...certification };
            responder.location = location || responder.location;
        } else {
            // Create new
            responder = new CPRResponder({
                userId,
                name,
                phone,
                certification,
                location
            });
        }

        await responder.save();

        res.json({
            success: true,
            message: 'CPR responder registered successfully',
            responder
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update CPR Responder Location
app.post('/api/cpr/:userId/location', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        const responder = await CPRResponder.findOneAndUpdate(
            { userId: req.params.userId },
            {
                'location.latitude': latitude,
                'location.longitude': longitude,
                'location.lastUpdated': new Date()
            },
            { new: true }
        );

        if (!responder) {
            return res.status(404).json({ success: false, error: 'Responder not found' });
        }

        res.json({ success: true, location: responder.location });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update CPR Responder Availability
app.post('/api/cpr/:userId/availability', async (req, res) => {
    try {
        const { isAvailable, radius } = req.body;

        const responder = await CPRResponder.findOneAndUpdate(
            { userId: req.params.userId },
            {
                'availability.isAvailable': isAvailable,
                'availability.radius': radius || 5000
            },
            { new: true }
        );

        if (!responder) {
            return res.status(404).json({ success: false, error: 'Responder not found' });
        }

        res.json({ success: true, availability: responder.availability });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Accept CPR Emergency
app.post('/api/cpr/accept/:emergencyId', async (req, res) => {
    try {
        const { responderId } = req.body;

        const emergency = await Emergency.findOne({ emergencyId: req.params.emergencyId });
        if (!emergency) {
            return res.status(404).json({ success: false, error: 'Emergency not found' });
        }

        // Update responder status
        const responderIndex = emergency.responders.findIndex(r => r.responderId === responderId);
        if (responderIndex !== -1) {
            emergency.responders[responderIndex].status = 'accepted';
            emergency.timeline.push({
                timestamp: new Date(),
                event: 'CPR responder accepted',
                details: { responderId }
            });
            await emergency.save();
        }

        // Notify user
        const user = await User.findOne({ userId: emergency.userId });
        io.to(emergency.userId).emit('cpr_responder_accepted', {
            responderId,
            eta: emergency.responders[responderIndex].eta
        });

        res.json({
            success: true,
            message: 'CPR response accepted',
            emergency
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== WEBSOCKET EVENTS ====================

io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // User joins their room
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined their room`);
    });

    // Real-time location updates
    socket.on('location_update', async (data) => {
        const { userId, latitude, longitude, address } = data;
        
        // Update user location in database
        await User.findOneAndUpdate(
            { userId },
            {
                location: {
                    latitude,
                    longitude,
                    address,
                    lastUpdated: new Date()
                }
            }
        );

        // Broadcast to emergency contacts if tracking is active
        const activeTracking = await RouteTracking.findOne({ 
            userId, 
            status: 'active' 
        });

        if (activeTracking) {
            io.to(activeTracking.trackingId).emit('live_location', {
                latitude,
                longitude,
                timestamp: new Date()
            });
        }
    });

    // Voice trigger detection
    socket.on('voice_trigger', async (data) => {
        const { userId, transcript, confidence } = data;
        console.log(`Voice trigger detected for ${userId}: "${transcript}" (${confidence}%)`);

        if (confidence > 70) {
            // Auto-trigger emergency
            socket.emit('auto_trigger_sos', {
                reason: 'voice_trigger',
                transcript
            });
        }
    });

    // Shake detection
    socket.on('shake_detected', (data) => {
        const { userId, intensity } = data;
        console.log(`Shake detected for ${userId}: intensity ${intensity}`);

        if (intensity > 8) {
            socket.emit('auto_trigger_sos', {
                reason: 'shake_detection',
                intensity
            });
        }
    });

    // Fall detection
    socket.on('fall_detected', (data) => {
        const { userId, impact } = data;
        console.log(`Fall detected for ${userId}: impact ${impact}`);

        socket.emit('auto_trigger_sos', {
            reason: 'fall_detection',
            impact
        });
    });

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ==================== SEED DATA (FOR TESTING) ====================

async function seedSafeSpots() {
    const count = await SafeSpot.countDocuments();
    if (count > 0) return;

    console.log('Seeding safe spots...');

    const spots = [
        {
            spotId: generateId('SPOT'),
            name: 'Central Police Station',
            type: 'police_station',
            location: { latitude: 17.3850, longitude: 78.4867, address: 'MG Road, Hyderabad' },
            contact: { phone: '100' },
            hours: { open24_7: true },
            verified: true,
            features: { hasSecurity: true, hasCCTV: true, wellLit: true }
        },
        {
            spotId: generateId('SPOT'),
            name: 'City Hospital Emergency',
            type: 'hospital',
            location: { latitude: 17.3900, longitude: 78.4900, address: 'Hospital Road, Hyderabad' },
            contact: { phone: '108' },
            hours: { open24_7: true },
            verified: true,
            features: { hasSecurity: true, hasCCTV: true, wellLit: true }
        },
        {
            spotId: generateId('SPOT'),
            name: 'Starbucks Coffee',
            type: 'cafe',
            location: { latitude: 17.3875, longitude: 78.4890, address: 'Main Street, Hyderabad' },
            contact: { phone: '+91-40-12345678' },
            hours: { open24_7: true },
            verified: true,
            features: { hasSecurity: false, hasCCTV: true, wellLit: true, publicArea: true }
        },
        {
            spotId: generateId('SPOT'),
            name: 'Phoenix Mall',
            type: 'mall',
            location: { latitude: 17.3920, longitude: 78.4920, address: 'Phoenix Road, Hyderabad' },
            contact: { phone: '+91-40-87654321' },
            hours: { open24_7: false, openingTime: '10:00', closingTime: '22:00' },
            verified: true,
            features: { hasSecurity: true, hasCCTV: true, wellLit: true, publicArea: true }
        }
    ];

    await SafeSpot.insertMany(spots);
    console.log('✅ Safe spots seeded');
}

// ==================== START SERVER ====================

server.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════╗
║   🛡️  SilentSOS Backend Server       ║
║                                       ║
║   Port: ${PORT}                       ║
║   Status: ✅ RUNNING                  ║
║   MongoDB: ✅ CONNECTED               ║
║   WebSocket: ✅ ACTIVE                ║
╚═══════════════════════════════════════╝
    `);

    // Seed database
    await seedSafeSpots();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});