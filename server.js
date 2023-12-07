const express = require('express');
const {listFiles, getFolderStructure} = require('./googleDrive');

const app = express();
const port = process.env.PORT || 3001; // Use environment port or 3001

app.get('/api/files', async (req, res) => {
    try {
        const files = await listFiles(); // Fetch files from Google Drive
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching files from Google Drive');
    }
});

app.get('/api/folders', async (req, res) => {
    try {
        const folders = await getFolderStructure(); // Fetch folders
        res.json(folders);
    } catch(error) {
        console.error(error);
        res.status(500).send('Error fetching folders from Google Drive');
    }
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});