const express = require("express");
const {
    listFiles,
    getFolderStructure,
    listPictures,
    listRecipes,
    uploadFile,
    createFolder,
} = require("./googleDrive");
const cors = require("cors");
const app = express();
app.use(cors()); // This will enable CORS for all routes
const port = process.env.PORT || 3001; // Use environment port or 3001

const multer = require("multer"); // Multer is a node.js middleware for handling multipart/form-data, which is primarily used for uploading files.
const upload = multer({ dest: "uploads/" }); // This is where the uploaded files will be stored temporarily
const fs = require("fs"); // Node.js file system module
const axios = require("axios"); // Axios is a promise-based HTTP client for the browser and node.js, used for searching recipe images

async function searchRecipeImage(recipeName) {
    const apiKey = "AIzaSyCR6Iq9OO1KMvAldWLH8pKTx4s4ZvRF2SU"; // google search api key
    const searchEngineId = "d50c4bbaeab59417d"; // google search engine id
    const query = `${recipeName} recipe image`
    try {
        const searchResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: apiKey,
                cx: searchEngineId,
                searchType: 'image',
                q: query,
                num: 1
            }
        });

        const results = searchResponse.data.items;
        if (!results || results.length === 0) {
            throw new error('No images found'); 
        }

        // Download the image
        const imageUrl = results[0].link; // URL of first image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });

        console.log(`Image URL: ${imageUrl}`);

        // Determine the file extension
        const mimeType = imageResponse.headers['content-type'];
        let extension = mimeType.split('/')[1];
        if (extension === 'jpeg') extension = 'jpg'; // Convert jpeg to jpg

        // Return the image buffer and the formatted filename
        return {
            coverImageBuffer: imageResponse.data,
            coverImageFilename: `${recipeName}.${extension}`,
            coverMimeType: mimeType
        };

    } catch (error) {
        console.error('Error during search:', error);
        throw error;
    }
}

// Add recipe upload endpoint to server
app.post("/upload/recipes", upload.array("files"), async (req, res) => {
    try {
        const files = req.files; // Array of files
        const recipeName = req.body.recipeName; // Recipe name from the form

        const { coverImageBuffer, coverImageFilename, coverMimeType } = await searchRecipeImage(recipeName); // Search for recipe image

        // Create a sub-folder for the recipe in Google Drive
        const recipeFolderId = await createFolder(
            recipeName,
            "1tAf5IEtpeJLRuC7_ZPxa3M3AnjJSeA5c"
        ); // Stores the ID of the newly created recipe sub-folder

        // Upload the cover image to the recipe folder in Google Drive
        if (coverImageBuffer) {
            await uploadFile(coverImageBuffer, coverImageFilename, coverMimeType, recipeFolderId);
        }

        let imageNum = 1; // Used to number the images on upload
        for (const file of files) {
            const filePath = file.path; // The path of the uploaded file
            const mimeType = file.mimetype; // MIME type of the file

            // Upload the file to the recipe folder in Google Drive
            await uploadFile(filePath, `${recipeName}_${imageNum}`, mimeType, recipeFolderId);

            // Delete the file from the temporary upload folder
            fs.unlinkSync(filePath);
            imageNum++;
        }

        res.status(200).send("Recipe uploaded successfully");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error uploading recipe");
    }
});

// Add picture upload endpoint to server
app.post("/upload/pictures", upload.array("files"), async (req, res) => {
    try {
        const files = req.files; // Array of files

        for (const file of files) {
            const filePath = file.path; // The path of the uploaded file
            const mimeType = file.mimetype; // MIME type of the file
            const parentFolderId = "1Ba3dxGlKbpIW4j6N4kqkdUiJxi5_dwm2"; // ID of pictures folder

            // Upload the file to Google Drive
            await uploadFile(filePath, mimeType, parentFolderId);

            // Delete the file from the temporary upload folder
            fs.unlinkSync(filePath);

            res.status(200).send("Files uploaded successfully");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Error uploading files");
    }
});

app.get("/api/files", async (req, res) => {
    try {
        const files = await listFiles(); // Fetch files from Google Drive
        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching files from Google Drive");
    }
});

app.get("/api/folders", async (req, res) => {
    try {
        const folders = await getFolderStructure(); // Fetch folders
        res.json(folders);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching folders from Google Drive");
    }
});

app.get("/api/pictures", async (req, res) => {
    try {
        const pictures = await listPictures();
        res.json(pictures);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching Pictures from Google Drive");
    }
});

app.get("/api/recipes", async (req, res) => {
    try {
        const recipes = await listRecipes();
        res.json(recipes);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching Recipes from Google Drive");
    }
});

app.get("/", (req, res) => {
    res.send(
        "Use /api/files for all files. Use /api/folders to get files in folder structure. api/recipies for recipies. api/pictures for pictures"
    );
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
