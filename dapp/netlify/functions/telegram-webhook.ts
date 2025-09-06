// Netlify function to handle Telegram bot webhooks
import { Handler, HandlerResponse } from "@netlify/functions";

// Redirect data type
// Telegram login widget will redirect the user to the URL specified in the data-auth-url attribute with the following parameters: id, first_name, last_name, username, photo_url, auth_date and hash;

const handler: Handler = async (event, context) => {
  const { id, first_name, last_name, username, photo_url, auth_date, hash } = event.queryStringParameters;

  console.log(id, first_name, last_name, username, photo_url, auth_date, hash);
};

export default handler;