const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 4002;
let getDataQuery = 'SELECT * FROM data WHERE clipid = ? AND enable= 1';

var mysqlConnectionStatus= false;
// Create a MySQL connection
const connection = mysql.createConnection({
    host: 'sql11.freemysqlhosting.net',
    user: 'sql11696916',
    password: 'Uy67ZpIJFA',
    database: 'sql11696916'
});

// Connect to MySQL
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + connection.threadId);
    mysqlConnectionStatus= true;
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Function to generate a random 6-digit number
function generateRandomClipid() {
    return Math.floor(100000 + Math.random() * 900000);
}

// Function to check if clipid already exists in the database
function checkDuplicateClipid(clipid, callback) {
    connection.query('SELECT COUNT(*) AS count FROM data WHERE clipid = ?', [clipid], (err, result) => {
        if (err) {
            console.error('Error checking duplicate clipid:', err.message);
            return callback(err, null);
        }

        const count = result[0].count;
        callback(null, count > 0);
    });
}

function incrementUsed(clipid){
    connection.query('UPDATE data SET used = used + 1 WHERE clipid = ?', [clipid], (err) => {
        if (err) {
            console.error('Error updating used count:', err.message);
            res.status(500).send('Error updating used count');
            connection.release();
            return;
        }
    });
}

// Route to handle form submission
app.post('/submit', (req, res) => {
    console.log(req.body);

    const { text, date, time, password } = req.body;
    let clipid = generateRandomClipid();
    const enable = true;
    const used = 0;
    console.log(clipid, text, date, time, enable, used, password);

    // Recursive function to insert data with unique clipid
    const insertData = () => {
        checkDuplicateClipid(clipid, (err, isDuplicate) => {
            if (err) {
                console.error('Error inserting data:', err.message);
                res.status(500).send('Error inserting data');
                return;
            }

            if (isDuplicate) {
                clipid = generateRandomClipid();
                insertData(); // Try again with a new clipid
            } else {
                connection.query('INSERT INTO data (clipid, text, date, time, enable, used, password) VALUES (?, ?, ?, ?, ?, ?, ?)', [clipid, text, date, time, enable, used, password], (err, result) => {
                    if (err) {
                        console.error('Error inserting data:', err.message);
                        res.status(500).send('Error inserting data');
                        return;
                    }

                    console.log('Data inserted into MySQL with ID:', result.insertId);
                    res.send({ message: 'Data saved successfully!', clipid }); // Send clipid in the response
                });
            }
        });
    };

    insertData();
});

app.get('/data/:clipid?', (req, res) => {
    const clipid = req.params.clipid;

    let params = [clipid];    

    connection.query(getDataQuery, params, (err, results) => {
        if (err) {
            console.error('Error retrieving data:', err.message);
            res.status(500).send('Error retrieving data');
            return;
        }

        if (results.length === 0) {
            const error= "not Found!";
            res.json({ error });
        }else{
            const { text, date, time, enable, used, password } = results[0];
            const error= "you need Password!";
            console.log(password);
            if(password== ""){
                res.json({ text, date, time, enable, used, password });
                incrementUsed(clipid);
            }else{
                res.json({ error });
            }
        }


    });
});

// Route to handle data retrieval based on clipid and optional password
app.get('/data/:clipid/:password?', (req, res) => {
    const clipid = req.params.clipid;
    const reqpassword = req.params.password;
    let params = [clipid]; // Initialize params with clipid

    connection.query(getDataQuery, params, (err, results) => {
        if (err) {
            res.status(500).send('Wrong Password');
            return;
        }

        if (results.length === 0) {
            const error= "not Found!";
            res.json({ error });
        }else{
            var error;
            const { text, date, time, enable, used, password } = results[0];
            console.log(reqpassword);
            switch (password){
                case reqpassword:
                    res.json({ text, date, time, enable, used, password });
                    incrementUsed(clipid);
                    break;
                case '':
                    error= "Don't need Password :]";
                    res.json({ text, date, time, enable, used, password, error });
                    incrementUsed(clipid);
                    break;
                default:
                    error= "Wrong Password :]";
                    res.json({ error });
            }
        }
        // if(password== reqpassword){
        // }else if(password=""){

        // }else if(password!= reqpassword){
        //     const error= "Wrong Password!";
        //     res.json({ error });
        // }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Create an event stream for sending messages to the client
let sseClients = [];

function sendSseMessage(data) {
    sseClients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Store the response object for future messages
    const clientId = uuidv4();
    sseClients.push({ id: clientId, res });

    // Send a message to all clients
    // sendSseMessage({ message: 'New client connected' });

    // Remove the client when the connection is closed
    req.on('close', () => {
        sseClients = sseClients.filter(client => client.id !== clientId);
        sendSseMessage({ message: mysqlConnectionStatus }); // Notify all clients
    });
});

// Send a message to all clients every 5 seconds
setInterval(() => {
    sendSseMessage({ message: mysqlConnectionStatus });
}, 5000);