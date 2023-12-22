const express = require("express");
const {
    listFiles,
    getRecipeFromFolder,
    getPicturesFromIds,
    getFolderStructure,
    getAllElementsOfType,
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
const sharp = require("sharp"); // Sharp is a high performance Node.js image processing library, used for converting images
const path = require("path"); // Node.js path module

async function downloadAndConvertImage(element) {
    try {
        console.log("Processing image: ", element.name);
        const name = element.name;

        // Create the main images directory if it doesn't exist
        const imagesDir = path.join(__dirname, "images");
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
        }

        // Create a subdirectory for the element if it doesn't exist
        const elementDir = path.join(imagesDir, name.split(".")[0]);
        if (!fs.existsSync(elementDir)) {
            fs.mkdirSync(elementDir);
        }

        // Function to download and save an image
        async function downloadImage(url, outputPath, isThumbnail = false) {
            try {
                const response = await axios({
                    method: "get",
                    url: url,
                    responseType: "arraybuffer",
                });

                let image = sharp(response.data).rotate(); // rotate() will automatically rotate the image based on EXIF data

                // If creating a thumbnail, resize the image
                if (isThumbnail) {
                    image = image.resize(200, 200);
                }

                await image.toFile(outputPath);
            } catch (error) {
                console.error("Error downloading image:", error.message);
            }
        }

        // Check and download the main image
        const mainImagePath = path.join(elementDir, `${name}`); // Assuming jpg for simplicity
        if (!fs.existsSync(mainImagePath)) {
            console.log("Downloading main image: ", element.name);
            await downloadImage(element.webContentLink, mainImagePath);
        } else {
            console.log(`Main image already exists: ${mainImagePath}`);
        }

        // Check and download the thumbnail
        const thumbnailPath = path.join(elementDir, `thumbnail_${name}`); // Assuming jpg for thumbnails
        if (!fs.existsSync(thumbnailPath)) {
            console.log("Downloading thumbnail: ", element.name);
            await downloadImage(element.webContentLink, thumbnailPath, true);
        } else {
            console.log(`Thumbnail already exists: ${thumbnailPath}`);
        }
    } catch (error) {
        console.error("Error processing image:", error);
    }
}

let recipeList = [];
let pictureList = [];
const maxItemsPerPage = 10; // maximum number of items to return per page

async function initializeData() {
    console.log("Initializing data");
    if (recipeList.length > 0 || pictureList.length > 0) {
        return;
    }
    try {
        await updateRecipeListAll();
        await updatePictureListAll();
    } catch (error) {
        console.error("Error initializing data", error);
    }
    console.log("Data initialized");
    await updateRecipeListPictures();
    await updatePictureListPictures();
    console.log("Images downloaded");
}

async function updateRecipeListPictures() {
    for (recipe of recipeList) {
        await downloadAndConvertImage(recipe.coverImg);
        for (descriptionImage of recipe.descriptionImgs) {
            await downloadAndConvertImage(descriptionImage);
        }
    }
}

async function updatePictureListPictures() {
    for (picture of pictureList) {
        await downloadAndConvertImage(picture);
    }
}

async function updateRecipeList(parentFolderId) {
    console.log("Before update:", recipeList.length, " recipes");
    try {
        const recipe = await getRecipeFromFolder(parentFolderId);
        await downloadAndConvertImage(recipe.coverImg);
        for (descriptionImage of recipe.descriptionImgs) {
            await downloadAndConvertImage(descriptionImage);
        }
        recipeList.unshift(recipe);
    } catch (error) {
        console.error("Error updating recipe list", error);
    }
    console.log("After update:", recipeList.length, " recipes");
}

async function updatePictureList(newPictures) {
    console.log("Before update:", pictureList.length, " pictures");
    try {
        const pictures = await getPicturesFromIds(newPictures);
        console.log("pictures", pictures);
        for (picture of pictures) {
            await downloadAndConvertImage(picture);
        }
        pictureList.unshift(...pictures);
    } catch (error) {
        console.error("Error updating picture list", error);
    }
    console.log("After update:", pictureList.length, " pictures");
}

async function updateRecipeListAll() {
    recipeList = await getAllElementsOfType("recipes");
}

async function updatePictureListAll() {
    pictureList = await getAllElementsOfType("pictures");
}

async function getRecipe(recipeName) {
    let recipe = recipeList.find((recipe) => recipe.folderName === recipeName);
    if (!recipe) {
        throw new Error(`Recipe not found: ${recipeName}`);
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
        const extension = mimeType.split("/")[1];

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
    const family = req.query.family; // 'Lemonade', 'Lance & Ricque', 'Mike & Lisa', or 'Lane & Kelly'
    
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
    let folderName = "";
    try {
        if (itemType === "recipes") {
            recipeName = req.body.recipeName; // Recipe name from the form
            authorName = req.body.authorName; // Author name from the form
            folderName = recipeName + "-" + authorName; // Folder name is the recipe name and author name combined
            if (recipeList.find((recipe) => recipe.folderName === folderName)) {
                return res
                    .status(400)
                    .send("Recipe already exists by this author");
            }
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
        let newPictures = [];
        for (const file of files) {
            const filePath = file.path; // The path of the uploaded file
            const mimeType = file.mimetype; // MIME type of the file
            const extension = mimeType.split("/")[1]; // The file extension
            const fileName =
                itemType === "pictures"
                    ? file.originalname
                    : `${recipeName}_${imageNum}.${extension}`; // The name of the uploaded file, split mimeType to get extension
            const sanitizedFileName = fileName.replace(/\s+/g, "_"); // Replace all whitespace characters with underscores

            // Upload the file to Google Drive
            const fileId = await uploadFile(
                filePath,
                sanitizedFileName,
                mimeType,
                parentFolderId
            );
            if (itemType === "pictures") {
                newPictures.push(fileId);
            }
            imageNum++;
        }

        if (itemType === "recipes") {
            console.log(
                "Updating recipe list with recipe folder ID:",
                parentFolderId
            );
            await updateRecipeList(folderName);
        } else if (itemType === "pictures") {
            console.log("Updating picture list with picture IDs:", newPictures);
            await updatePictureList(newPictures);
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

app.get("/update", async (req, res) => {
    const itemType = req.query.type; // 'pictures' or 'recipes' or 'all'
    try {
        if (itemType === "all") {
            await updateRecipeListPictures();
            await updatePictureListPictures();
        } else if (itemType === "recipes") {
            await updateRecipeListPictures();
        } else if (itemType === "pictures") {
            await updatePictureListPictures();
        }

        res.status(200).send("Data updated successfully");
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
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

app.get("/image/:imageName", (req, res) => {
    const imageName = req.params.imageName;
    const imageType = req.query.type; // 'full' for the full image, 'thumb' for the thumbnail

    // Determine the path based on the requested image type
    let imagePath;
    if (imageType === "thumb") {
        imagePath = path.join(
            __dirname,
            "images",
            imageName.split(".")[0],
            `thumbnail_${imageName}`
        );
    } else {
        // Default to serving the full image
        imagePath = path.join(
            __dirname,
            "images",
            imageName.split(".")[0],
            `${imageName}`
        );
    }

    console.log("Serving image:", imagePath);

    // Send the image file if it exists
    res.sendFile(imagePath, (error) => {
        if (error) {
            // Handle errors
            res.status(404).send("Image not found");
        }
    });
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
        maxItems = 5; // maxItems for slideshow
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
