import { generateContentWithRetry } from './lib/gemini';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function test() {
  const prompt = `You are a web analytics expert. The following audit rules failed for a client in the "Healthcare" industry.

Website Context:
URL: https://example.com
Business Type: Clinic
Key Actions: Booking, Contact

Failed Rules:
- ID: purchase-exists
  Title: Purchase Event Tracking
  Current Recommendation: Implement a standard GA4 purchase event.

Please provide a highly tailored, actionable 1-2 sentence recommendation for each failed rule, specialized for their industry and website.
Return the result as a JSON array of objects, with each object containing "issueId" and "tailoredRecommendation". Return ONLY valid JSON.`;

  try {
    const aiResponse = await generateContentWithRetry(prompt, {
      temperature: 0.7,
      responseMimeType: 'application/json'
    });
    console.log("Raw AI Response:", aiResponse);
    console.log("Parsed:", JSON.parse(aiResponse));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
