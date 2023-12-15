const express = require('express');
const {listFiles, getFolderStructure, listPictures, listRecipes, uploadFile, authorize} = require('./googleDrive');
const cors = require('cors');
const app = express();
app.use(cors()); // This will enable CORS for all routes
const port = process.env.PORT || 3001; // Use environment port or 3001

const multer = require('multer'); // Multer is a node.js middleware for handling multipart/form-data, which is primarily used for uploading files.
const upload = multer({ dest: 'uploads/'}); // This is where the uploaded files will be stored temporarily
const fs = require('fs'); // Node.js file system module

// Add endpoint to server
app.post('/upload/pictures', upload.array('files'), async (req, res) => {
    try {
        const files = req.files; // Array of files
        
        const authClient = await authorize(); // Ensure you have a valid authClient

        for (const file of files) {
            const filePath = file.path; // The path of the uploaded file
            const mimeType = file.mimetype; // MIME type of the file
            const parentFolderId = '1Ba3dxGlKbpIW4j6N4kqkdUiJxi5_dwm2'; // ID of pictures folder

            // Upload the file to Google Drive
            await uploadFile(filePath, mimeType, parentFolderId);

            // Delete the file from the temporary upload folder
            fs.unlinkSync(filePath);

        res.status(200).send('Files uploaded successfully');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading files');
    }
});

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

app.get('/api/pictures', async (req, res) => {
    try {
        const pictures = await listPictures();
        res.json(pictures);
    } catch(error) {
        console.error(error);
        res.status(500).send('Error fetching Pictures from Google Drive');
    }
});

app.get('/api/recipes', async (req, res) => {
    try {
        const recipes = await listRecipes();
        res.json(recipes);
    } catch(error) {
        console.error(error);
        res.status(500).send('Error fetching Recipes from Google Drive');
    }
});

app.get('/', (req, res) => {
    res.send('Use /api/files for all files. Use /api/folders to get files in folder structure. api/recipies for recipies. api/pictures for pictures');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});