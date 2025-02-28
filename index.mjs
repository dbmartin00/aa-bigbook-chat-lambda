import { OpenAI } from "openai";
import AWS from "aws-sdk";

const s3 = new AWS.S3();
const BUCKET_NAME = "aa-ai-raw-documents";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

        // Fetch data from S3 (Big Book + 12n12)
        const bigBookData = await fetchBooksFromS3();
        const relevantPassages = findRelevantPassages(userMessage, bigBookData);

        // Call OpenAI API
        const aiPrompt = `Here is the user's question: "${userMessage}". Based on the Big Book and 12 Steps & 12 Traditions, respond using these relevant excerpts: \n\n${relevantPassages}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an AI assistant trained to discuss Alcoholics Anonymous literature." },
                { role: "user", content: aiPrompt }
            ],
            temperature: 0.7,
        });

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

