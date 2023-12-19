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

async function updateRecipeList(recipeList) {
    recipeList = await listRecipes();
}

async function updatePictureList(pictureList) {
    pictureList = await listPictures();
}

let recipeList = [];
let pictureList = [];
const maxItemsPerPage = 12; // maximum number of items to return per page

async function initializeData() {
    try {
        recipeList = await listRecipes();
        pictureList = await listPictures();
    } catch (error) {
        console.error("Error initializing data", error);
    }
}

async function getRecipe(recipeName) {
    if (recipeList.length === 0) {
        await updateRecipeList();
    }
    let recipe = recipeList.find((recipe) => recipe.folderName === recipeName);
    if (!recipe) {
        throw new Error(`Recipe not found: ${decodedRecipeName}`);
    }
    return recipe;
}

async function searchRecipeImage(recipeName) {
    const apiKey = "AIzaSyCR6Iq9OO1KMvAldWLH8pKTx4s4ZvRF2SU"; // google search api key
    const searchEngineId = "d50c4bbaeab59417d"; // google search engine id
    const query = `${recipeName} recipe image`;
    try {
        const searchResponse = await axios.get(
            "https://www.googleapis.com/customsearch/v1",
            {
                params: {
                    key: apiKey,
                    cx: searchEngineId,
                    searchType: "image",
                    q: query,
                    num: 1,
                },
            }
        );

        const results = searchResponse.data.items;
        if (!results || results.length === 0) {
            throw new error("No images found");
        }

        // Download the image
        const imageUrl = results[0].link; // URL of first image
        const imageResponse = await axios.get(imageUrl, {
            responseType: "arraybuffer",
        });

        // Determine the file extension
        const mimeType = imageResponse.headers["content-type"];
        let extension = mimeType.split("/")[1];
        if (extension === "jpeg") extension = "jpg"; // Convert jpeg to jpg

        // Return the image buffer and the formatted filename
        return {
            coverImageBuffer: imageResponse.data,
            coverImageFilename: `${recipeName}.${extension}`,
            coverMimeType: mimeType,
        };
    } catch (error) {
        console.error("Error during search:", error);
        throw error;
    }
}

// Add picture upload endpoint to server
app.post("/api/upload", upload.array("files"), async (req, res) => {
    const itemType = req.query.type; // 'pictures' or 'recipes'
    if (!["pictures", "recipes"].includes(itemType)) {
        return res.status(400).send("Invalid type parameter");
    }
    let recipeName = "";
    let authorName = "";

    const files = req.files; // Array of files
    let parentFolderId =
        itemType === "pictures"
            ? "1Ba3dxGlKbpIW4j6N4kqkdUiJxi5_dwm2"
            : "1tAf5IEtpeJLRuC7_ZPxa3M3AnjJSeA5c";
    try {
        if (itemType === "recipes") {
            recipeName = req.body.recipeName; // Recipe name from the form
            authorName = req.body.authorName; // Author name from the form
            parentFolderId = await createFolder(
                recipeName,
                authorName,
                parentFolderId
            ); // stores the ID of the newly created recipe sub-folder

            // Search for recipe image
            const { coverImageBuffer, coverImageFilename, coverMimeType } =
                await searchRecipeImage(recipeName);

            // Upload the cover image to the recipe folder in Google Drive
            if (coverImageBuffer) {
                await uploadFile(
                    coverImageBuffer,
                    coverImageFilename,
                    coverMimeType,
                    parentFolderId
                );
            }
        }

        let imageNum = 1; // Used to number the images on upload of recipe
        for (const file of files) {
            const filePath = file.path; // The path of the uploaded file
            const mimeType = file.mimetype; // MIME type of the file
            const fileName =
                itemType === "pictures"
                    ? file.originalname
                    : `${recipeName}_${imageNum}`; // The name of the uploaded file

            // Upload the file to Google Drive
            await uploadFile(filePath, fileName, mimeType, parentFolderId);
            imageNum++;
        }
        if (itemType === "recipes") {
            await updateRecipeList();
        } else {
            await updatePictureList();
        }
        res.status(200).send(
            `{{itemType === "pictures" ? "Picture(s)" : "Recipe"}} uploaded successfully`
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    } finally {
        // Cleanup: Delete all files from the temp folder
        for (const file of files) {
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupError) {
                console.error(
                    "Error cleaning up files",
                    file.path,
                    cleanupError
                );
            }
        }
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

// Initialize data on front end start
app.get("/api/initialize", async (req, res) => {
    // Check if data is already initialized
    if (recipeList.length > 0 && pictureList.length > 0) {
        return res.status(200).send("Data already initialized");
    }

    try {
        await initializeData();
        return res.status(200).send("Data initialized successfully");
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: error.message });
    }
});

// params: name
app.get("/api/recipes", async (req, res) => {
    const recipeName = req.query.name;
    try {
        const recipe = await getRecipe(recipeName);
        res.json(recipe);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error: Could not find recipe");
    }
});

// params: type, page, slideshow
app.get("/api/items", async (req, res) => {
    const itemType = req.query.type; // 'pictures' or 'recipes'
    const isSlideshow = "slideshow" in req.query; // true or false, optional flag to declare slideshow which randomizes the order of the items and might return different amount of items
    const pageNumber = parseInt(req.query.page) || 1; // page number to read list, default is 1

    if (recipeList.length === 0 || pictureList.length === 0) {
        await initializeData();
    }

    if (!["pictures", "recipes"].includes(itemType)) {
        return res.status(400).send("Invalid type parameter");
    }

    let items;
    if (itemType === "pictures") {
        items = [...pictureList]; // creates a copy of pictureList so it doesnt modify the original
    } else if (itemType === "recipes") {
        items = [...recipeList]; // creates a copy of recipeList so it doesnt modify the original
    }

    // Randomize the order of the items if the slideshow flag is set
    let maxItems;
    if (isSlideshow) {
        items = items.sort(() => Math.random() - 0.5);
        maxItems = 10; // maxItems for slideshow
    } else {
        maxItems = maxItemsPerPage; // maxItemsPerPage is seperate from maxItems because maxItemsPerPage is used for total pages calculation in other endpoint
    }

    // Calculate the starting index for the items based on the page number
    const startIndex = (pageNumber - 1) * maxItems;
    const endIndex = startIndex + maxItems;

    // Slice the array to get only the items for the current page
    const itemsForPage = items.slice(startIndex, endIndex);

    res.json(itemsForPage);
});

// Request itemCount for initial page load, used in Pictures.jsx and Recipes.jsx on page load
// params: type
app.get("/api/itemCount", async (req, res) => {
    const itemType = req.query.type; // 'pictures' or 'recipes'
    if (recipeList.length === 0 || pictureList.length === 0) {
        await initializeData();
    }
    if (!["pictures", "recipes"].includes(itemType)) {
        return res.status(400).send("Invalid type parameter");
    }

    let itemCount;
    if (itemType === "pictures") {
        itemCount = pictureList.length;
    } else if (itemType === "recipes") {
        itemCount = recipeList.length;
    }

    const totalPages = Math.ceil(itemCount / maxItemsPerPage);
    res.json({ itemCount, totalPages });
});

app.get("/", (req, res) => {
    res.send(
        "Use /api/files for all files. Use /api/folders to get files in folder structure. api/recipies for recipies. api/pictures for pictures"
    );
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
