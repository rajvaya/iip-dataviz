console.log("Hello DataViz");
const fs = require('fs');
const path = require('path');


const API_TOKEN = process.env.API_TOKEN;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=" + API_TOKEN;


// Function to classify a single title
async function classifyTitles(titles) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{
                        text: `Help me with analysing and generating data for of given youtube videoss titles from array and 
                        classify and create json structure for each title and 
                        add labels categories and type of video as 3 diffrent properties and mood that could have beeen watched as singal mood string and retun array of json objects and keep max 5 items in  in each property array for each title
                        keep it short and simple just give JSON output no explanation or code just JSON output and it must have all the properties and values and nothing else give me json array of objects and nothing else plese keep it simple for machine processing
                        array of titles = \n\n["${titles}"]`
                    }]
                }],
                generationConfig: {
                    temperature: 1,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                }
            }),
        });
        if(response.status !== 200){
            const errorData = await response.json();
            console.log(errorData);
            throw new Error(`HTTP error! status: ${response.status}`,errorData);
        }


        return response.json();
    } catch (error) {
        console.error("Error in classifyTitles:", error);
        throw error;
    }
}




async function workOnJsonData(month, count, page = 1) {
    try {
        // Read the latest watch history data first
        const latestWatchHistory = await fs.promises.readFile('./watch-history.json', 'utf8');
        const watchHistory = JSON.parse(latestWatchHistory);
        
        // Get entries for specified month
        const monthData = watchHistory['2024'][month];
        if (!monthData || !monthData.titles) {
            throw new Error(`No data found for month: ${month}`);
        }

        // Get specified number of titles
        const startIndex = (page - 1) * count;
        const titles = monthData.titles
            .slice(startIndex, startIndex + count)
            .map(entry => entry.title.replace('Watched ', ''));

        // Classify the titles
        const classificationResponse = await classifyTitles(titles);

        // Parse the classification response text into JSON
        let classificationData = [];
        try {
            let responseText = classificationResponse.candidates[0].content.parts[0].text;
            
            // Extract text between ```json and ``` if present
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                responseText = jsonMatch[1];
            }
            
            // Clean up any trailing commas
            responseText = responseText.replace(/,(\s*[\]}])/g, '$1');
            
            // Ensure valid JSON array structure
            responseText = responseText.trim();
            if (!responseText.startsWith('[')) {
                responseText = '[' + responseText;
            }
            if (!responseText.endsWith(']')) {
                responseText = responseText + ']';
            }

            const parsedData = JSON.parse(responseText);
            
            if (Array.isArray(parsedData)) {
                classificationData = parsedData.map(item => ({
                    title: item?.title || '',
                    type: item?.type || '',
                    mood: item?.mood || '',
                    categories: Array.isArray(item?.categories) ? item.categories : [],
                    labels: Array.isArray(item?.labels) ? item.labels : []
                }));
            } else {
                console.error("Classification response is not an array, using empty array");
            }
        } catch (parseError) {
            console.error("Error parsing classification response:", parseError);
            console.error("Raw text:", classificationResponse.candidates[0].content.parts[0].text);
            console.error("Fallback parsing also failed");
        }
        // Use the same watchHistory object we read at the start
        const updatedMonthData = watchHistory['2024'][month];

        for (let i = 0; i < classificationData.length; i++) {
            const classifiedItem = classificationData[i];
            
            // Find matching watch history item by title
            const watchHistoryItem = updatedMonthData.titles.find(item => {
                const historyTitle = item.title.replace('Watched ', '');
                return historyTitle === classifiedItem.title;
            });

            if (watchHistoryItem) {
                // Initialize arrays if they don't exist
                watchHistoryItem.categories = [];
                watchHistoryItem.labels = [];
                
                // Safely assign new properties
                watchHistoryItem.categories = Array.isArray(classifiedItem.categories) ? classifiedItem.categories : [];
                watchHistoryItem.labels = Array.isArray(classifiedItem.labels) ? classifiedItem.labels : [];
                watchHistoryItem.type = typeof classifiedItem.type === 'string' ? classifiedItem.type : '';
                watchHistoryItem.mood = typeof classifiedItem.mood === 'string' ? classifiedItem.mood : '';
            }
        }

        // Create/append to a new processed data file
        const processedFilePath = path.join(__dirname, `month-${month}-processed-history.json`);
        let processedHistory = [];
        
        try {
            const existingProcessed = await fs.promises.readFile(processedFilePath, 'utf8');
            processedHistory = JSON.parse(existingProcessed);
        } catch (err) {
            // File doesn't exist yet, continue with empty array
        }

        // Add newly processed items
        const newProcessedItems = updatedMonthData.titles
            .slice(startIndex, startIndex + count)
            .map(item => ({
                id: item.id,
                title: item.title,
                categories: item.categories || [],
                labels: item.labels || [],
                type: item.type || '',
                mood: item.mood || '',
                time: item.time,
            }));

        // Remove duplicates based on id before adding new items
        processedHistory = processedHistory.filter(item => 
            !newProcessedItems.some(newItem => newItem.id === item.id)
        );
        processedHistory.push(...newProcessedItems);

        // Write to processed history file
        await fs.promises.writeFile(
            processedFilePath,
            JSON.stringify(processedHistory, null, 2),
            'utf8'
        );

        return watchHistory['2024'][month].titles;

    } catch (error) {
        console.error("Error in workOnJsonData:", error);
        throw error; // Re-throw to handle in calling function
    }
}

// Uncomment to run the filter
async function processAllTitles(month) {
    const batchSize = 15;
    let pageNumber = 1;
    
    // Read watch history to get total count for month
    const watchHistory = JSON.parse(await fs.promises.readFile('./watch-history.json', 'utf8'));
    const totalCount = watchHistory['2024'][month].count;
    const totalPages = Math.ceil(totalCount / batchSize);
    
    while (pageNumber <= totalPages) {
        console.log(`Processing batch of ${batchSize} items starting from ${pageNumber}`);
        const titles = await workOnJsonData(month, batchSize, pageNumber);
        
        if (!titles || titles.length === 0) {
            console.log('Finished processing all titles');
            break;
        }
        
        pageNumber += 1;
        console.log(`Processed ${pageNumber-1} of ${totalPages} pages`);
        
        // Add 3 second cooling period between batches
        console.log("Cooling period");
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Run the processing for 6 months
const months = [ 'january', 'february', 'march', 'april', 'may', 'june'];



// (async () => {
//     for (const month of months) {
//         console.log(`\nProcessing month: ${month}`);
//         await processAllTitles(month);
        
//         if (month !== months[months.length - 1]) {
//             console.log(`Cooling down for 1 minute before processing next month...`);
//             await new Promise(resolve => setTimeout(resolve, 60000));
//         }
//     }
// })();

async function getTotalTitlesCount() {
    try {
        // Read watch history file
        const watchHistory = JSON.parse(await fs.promises.readFile('./watch-history.json', 'utf8'));
        
        let totalCount = 0;
        let monthsProcessed = [];
        
        // Process each month from predefined array
        for (const month of months) {
            if (watchHistory['2024'][month] && watchHistory['2024'][month].count) {
                totalCount += watchHistory['2024'][month].count;
                monthsProcessed.push(month);
                console.log(`${month}: ${watchHistory['2024'][month].count} titles`);
            } else {
                console.log(`${month}: 0 titles`);
            }
        }
        
        console.log(`\nTotal titles from all months in 2024: ${totalCount}`);
        console.log(`Months processed: ${monthsProcessed.join(', ')}`);
        return totalCount;
        
    } catch (error) {
        console.error("Error getting total titles count:", error);
        throw error;
    }
}

///getTotalTitlesCount();

// Uncomment to run the count
// getTotalTitlesCount();
async function analyzeProcessedData() {
    try {
        // Create a single CSV for all months
        let csvContent = 'Month,Metric,Value,Count\n';

        for (const month of months) {
            // Read the processed history file
            const processedFilePath = path.join(__dirname, `month-${month}-processed-history.json`);
            const processedData = JSON.parse(fs.readFileSync(processedFilePath, 'utf8'));

            // Initialize counters
            const moodCounts = {};
            const categoryCounts = {};
            const labelCounts = {};

            // Process each video entry
            processedData.forEach(item => {
                // Track moods
                if (item.mood) {
                    moodCounts[item.mood] = (moodCounts[item.mood] || 0) + 1;
                }
                
                // Track categories
                if (item.categories && item.categories.length > 0) {
                    item.categories.forEach(category => {
                        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
                    });
                }

                // Track labels
                if (item.labels && item.labels.length > 0) {
                    item.labels.forEach(label => {
                        labelCounts[label] = (labelCounts[label] || 0) + 1;
                    });
                }
            });

            // Get top 5 for each category
            const topCategories = Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            const topMoods = Object.entries(moodCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
                
            const topLabels = Object.entries(labelCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // Add to CSV content
            topCategories.forEach(([category, count]) => {
                csvContent += `${month},Category,${category},${count}\n`;
            });

            topMoods.forEach(([mood, count]) => {
                csvContent += `${month},Mood,${mood},${count}\n`;
            });

            topLabels.forEach(([label, count]) => {
                csvContent += `${month},Label,${label},${count}\n`;
            });
        }

        // Write to single CSV file
        const csvFilePath = path.join(__dirname, 'monthly_top5_analysis.csv');
        fs.writeFileSync(csvFilePath, csvContent);

        console.log(`\nCombined top 5 analysis CSV created at: ${csvFilePath}`);

    } catch (error) {
        console.error('Error analyzing patterns:', error);
        throw error;
    }
}

// Helper function to get week number
function getWeekNumber(date) {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const daysSinceFirst = Math.floor((date - firstDayOfMonth) / (24 * 60 * 60 * 1000));
    return Math.ceil((daysSinceFirst + firstDayOfMonth.getDay() + 1) / 7);
}

// Analyze data for all available months to build story graph

// // Process each month sequentially
// months.forEach(async (month) => {
//     console.log(`\nAnalyzing ${month}...`);
//     await analyzeProcessedData(month);
// });


