import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGemini() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function identifyTrailFromWaypoints(waypoints: {lat: number, lng: number}[]) {
  const gemini = getGemini();

  const response = await gemini.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `I have a series of GPS waypoints for an off-road trail: ${JSON.stringify(waypoints)}. 
Search the internet to identify if these coordinates match a known 4x4 off-road trail.
Respond with a JSON object containing:
- name: The name of the matching trail (or a suggested name if unknown).
- description: A short description of the trail.
- difficulty: 'easy', 'moderate', 'hard', or 'extreme'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          difficulty: { type: Type.STRING, description: "easy, moderate, hard, or extreme" },
        },
        required: ["name", "description", "difficulty"],
      },
      tools: [{ googleSearch: {} }],
    },
  });

  try {
    const jsonStr = response.text?.trim() || '{}';
    return JSON.parse(jsonStr) as {
      name: string;
      description: string;
      difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
    };
  } catch (err) {
    console.error("Failed to parse Gemini response", err);
    throw err;
  }
}

export async function searchTrailInfo(trailName: string) {
  const gemini = getGemini();

  const response = await gemini.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Find information for the 4x4 off-road trail named "${trailName}". 
Respond with a JSON object containing:
- description: A short, concise summary description (max 2 sentences).
- difficulty: One of 'easy', 'moderate', 'hard', 'extreme'. Guess based on the info.
- lat: the approximate latitude coordinate as a number.
- lng: the approximate longitude coordinate as a number.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          difficulty: { type: Type.STRING, description: "easy, moderate, hard, or extreme" },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
        },
        required: ["description", "difficulty", "lat", "lng"],
      },
      tools: [{ googleSearch: {} }],
    },
  });

  try {
    const jsonStr = response.text?.trim() || '{}';
    return JSON.parse(jsonStr) as {
      description: string;
      difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
      lat: number;
      lng: number;
    };
  } catch (err) {
    console.error("Failed to parse Gemini response", err);
    throw err;
  }
}
