require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const openRouterKey = process.env.OPEN_ROUTER_KEY;
const bot = new TelegramBot(token, {polling: true});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Olá! Envie a descrição da sua refeição e eu calcularei os macros.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  const text = msg.text;

  if (text.startsWith('/')) return;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "google/gemini-2.0-flash-thinking-exp:free",
        messages: [
          {
            role: "system",

            // Exemplo de resposta esperada
            // {
            //   "recipe_name": "Broccoli with pasta",
            //   "likely_ingredients": [
            //     {
            //       "name": "Broccoli",
            //       "weight": 60,
            //       "fat": 0.3,
            //       "carbs": 3.6,
            //       "protein": 2.4,
            //       "calories": 20
            //     },
            //     {
            //       "name": "Pasta",
            //       "weight": 100,
            //       "fat": 1.1,
            //       "carbs": 25.0,
            //       "protein": 5.0,
            //       "calories": 131
            //     }
            //   ]
            // }

            content: "Você é um nutricionista especializado em calcular macros. Considere que os macros dos alimentos já preparados. Responda apenas os valores em formato JSON, sem formatação, em português, conforme o exemplo: {\"recipe_name\": \"Broccoli with pasta\", \"likely_ingredients\": [{\"name\": \"Broccoli\", \"weight\": 60, \"fat\": 0.3, \"carbs\": 3.6, \"protein\": 2.4, \"calories\": 20}, {\"name\": \"Pasta\", \"weight\": 100, \"fat\": 1.1, \"carbs\": 25.0, \"protein\": 5.0, \"calories\": 131}]}"
          },
          {
            role: "user",
            content: `Calcule os macros para: ${text}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    let parsedData;
    try {
      parsedData = JSON.parse(response.data.choices[0].message.content);  // Parse the JSON string

    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError, response.data);
      return bot.sendMessage(chatId, 'Received invalid data from the API. Please try again.  The API response may not be valid JSON.'); // More helpful message
    }

    // Check if the parsed data has the expected structure
    if (!parsedData || !parsedData.likely_ingredients) {
      console.error("Unexpected API response format:", parsedData);
      return bot.sendMessage(chatId, 'The API returned data in an unexpected format. Please try again.');
    }


    const message = composeMessage(parsedData);

    bot.sendMessage(chatId, message); // Send the parsed, formatted JSON
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, 'Ocorreu um erro ao calcular os macros. Tente novamente.');
  }

  
});

console.log('Bot iniciado...');

function composeTotalFat(parsedData) {
  return parsedData.likely_ingredients.reduce((total, ingredient) => total + ingredient.fat, 0);
}

function composeTotalCalories(parsedData) {
  return parsedData.likely_ingredients.reduce((total, ingredient) => total + ingredient.calories, 0);
}

function composeTotalCarbs(parsedData) {
  return parsedData.likely_ingredients.reduce((total, ingredient) => total + ingredient.carbs, 0);
}

const composeTotalProtein = (ingredients) => {
  return ingredients.reduce((total, ingredient) => total + ingredient.protein, 0);
};


function composeMessage(parsedData) {

  const totalProtein = composeTotalProtein(parsedData.likely_ingredients);
  const totalCalories = composeTotalCalories(parsedData);
  const totalFat = composeTotalFat(parsedData);
  const totalCarbs = composeTotalCarbs(parsedData);

  const messageTotals = `
    Calorias: ${totalCalories}kcal
    • Carboidratos: ${totalCarbs}g
    • Proteínas: ${totalProtein}g
    • Gorduras: ${totalFat}g
  `;


  const messageIngredients = parsedData.likely_ingredients.map(ingredient => {
    return `  • ${ingredient.name} (${ingredient.weight}g, ${ingredient.calories}kcal, ${ingredient.carbs}C, ${ingredient.protein}P, ${ingredient.fat}G)\n`;
  }).join('');

  return `${parsedData.recipe_name}:

  Ingredientes:
  ${messageIngredients}

  ${messageTotals}
  `;

}

