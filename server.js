const express = require('express');
const {listFiles, getFolderStructure, listPictures, listRecipes} = require('./googleDrive');

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
    res.send('Use /api/files for all files. Use /api/folders to get files in folder structure.');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});