import { OpenAI } from "openai";
import AWS from "aws-sdk";

const s3 = new AWS.S3();
const BUCKET_NAME = "aa-ai-raw-documents";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let bigBookData = null; // Global variable for caching
let lastFetchTime = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // Cache for 1 day 

export const handler = async (event) => {
    console.log("Incoming request:", JSON.stringify(event));

    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const userMessage = body.message;

        if (!userMessage) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Message is required" })
            };
        }

	const now = Date.now();
	if(!bigBookData || now - lastFetchTime > CACHE_DURATION_MS) {
	  console.log('fetching books from S3...');
          bigBookData = await fetchBooksFromS3();
          lastFetchTime = now;
	}

        // Fetch data from S3 (Big Book + 12n12)
        const relevantPassages = findRelevantPassages(userMessage, bigBookData);

        // Call OpenAI API
        const aiPrompt = `Here is the user's question: "${userMessage}". Based on the Big Book and 12 Steps & 12 Traditions, respond using these relevant excerpts: \n\n${relevantPassages}`;

	const startOpenAiInMillis = new Date().getTime();
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an AI assistant trained to discuss Alcoholics Anonymous literature." },
                { role: "user", content: aiPrompt }
            ],
            temperature: 0.7,
        });
	console.log("OpenAI response in " + (new Date().getTime() - startOpenAiInMillis));

        return {
            statusCode: 200,
            body: JSON.stringify({ response: response.choices[0].message.content })
        };
    } catch (error) {
        console.error("Lambda Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Something went wrong", details: error.message })
        };
    }
};


// Function to fetch Big Book & 12n12 from S3
const fetchBooksFromS3 = async () => {
    try {
        const bigBookParams = { Bucket: BUCKET_NAME, Key: "bigbook.json" };
        const twelveAndTwelveParams = { Bucket: BUCKET_NAME, Key: "12n12.json" };

        const [bigBookData, twelveAndTwelveData] = await Promise.all([
            s3.getObject(bigBookParams).promise(),
            s3.getObject(twelveAndTwelveParams).promise()
        ]);

        return [...JSON.parse(bigBookData.Body.toString("utf-8")), ...JSON.parse(twelveAndTwelveData.Body.toString("utf-8"))];
    } catch (error) {
        console.error("Error fetching books from S3:", error);
        return [];
    }
};

// Function to find relevant passages
const findRelevantPassages = (message, bookData) => {
    const lowerMessage = message.toLowerCase();
    return bookData
        .filter(passage => passage.text.toLowerCase().includes(lowerMessage))
        .map(p => p.text)
        .join("\n\n") || "No relevant passage found.";
};

