const { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ]
});

client.commands = new Collection();
client.cogs = new Collection(); // Store cog references for better access
const cogs = ['leveling', 'games', 'raffle'];

// Collect commands for registration
const commands = [];
cogs.forEach(cogName => {
  try {
    const cog = require(`./cogs/${cogName}`);
    if (!cog.commands || !Array.isArray(cog.commands)) {
      console.error(`Error: Cog ${cogName} does not export a valid commands array`);
      return;
    }
    
    // Store the cog instance for easy access
    client.cogs.set(cogName, cog);
    
    cog.commands.forEach(command => {
      if (!command || typeof command.toJSON !== 'function') {
        console.error(`Error: Invalid command in ${cogName}: ${JSON.stringify(command)}`);
        return;
      }
      const commandData = command.toJSON();
      if (!commandData.name) {
        console.error(`Error: Command in ${cogName} missing name: ${JSON.stringify(commandData)}`);
        return;
      }
      client.commands.set(commandData.name, cog);
      commands.push(commandData);
      console.log(`✅ Loaded command: ${commandData.name} from ${cogName}`);
    });
    
    // Handle events if the cog has them
    if (cog.events) {
      Object.entries(cog.events).forEach(([event, handler]) => {
        client.on(event, (...args) => handler(...args));
      });
    }
    
    console.log(`✅ Successfully loaded cog: ${cogName}`);
  } catch (error) {
    console.error(`❌ Failed to load cog ${cogName}:`, error);
  }
});

// Register commands with Discord API
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Replace with your server's ID
const GUILD_ID = '1363087110554390598';

client.once('ready', async () => {
  console.log(`🚀 Logged in as ${client.user.tag} (ID: ${client.user.id})`);
  console.log(`📊 Bot is active in ${client.guilds.cache.size} guild(s)`);
  
  try {
    console.log(`🔄 Clearing existing guild commands for guild ${GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: [] });
    console.log('✅ Cleared existing guild commands.');

    console.log(`🔄 Started refreshing guild (/) commands for guild ${GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Successfully registered ${commands.length} guild (/) commands:`, commands.map(cmd => cmd.name).join(', '));
  } catch (error) {
    console.error('❌ Error registering guild commands:', error);
    if (error.code === 'TokenInvalid') {
      console.error('❌ Invalid DISCORD_TOKEN. Verify it in .env and ensure it matches your bot token from Discord Developer Portal.');
    } else if (error.code === 429) {
      console.error('❌ Rate limit hit. Wait 5–10 minutes and try again.');
    } else if (error.code === 50001) {
      console.error('❌ Bot lacks access to guild. Ensure the bot is invited to the server with correct permissions.');
    } else {
      console.error('❌ Detailed error:', JSON.stringify(error, null, 2));
    }
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      const cog = client.commands.get(interaction.commandName);
      if (!cog) {
        console.error(`❌ Command not found: ${interaction.commandName}`);
        await interaction.reply({ 
          content: 'Command not found!', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`📝 Executing command: ${interaction.commandName} by ${interaction.user.username} (${interaction.user.id})`);
      await cog.execute(interaction);
      
    } else if (interaction.isButton()) {
      const [prefix] = interaction.customId.split('_');
      console.log(`🔘 Button pressed: ${interaction.customId} by ${interaction.user.username} (${interaction.user.id})`);
      
      // Map button prefixes to cog names
      let cogName;
      if (prefix === 'meltdown' || prefix === 'vault') {
        cogName = 'games';
      } else {
        cogName = prefix;
      }
      
      const cog = client.cogs.get(cogName);
      if (cog && typeof cog.handleButton === 'function') {
        console.log(`🔄 Routing button ${interaction.customId} to cog ${cogName}`);
        await cog.handleButton(interaction);
      } else {
        console.error(`❌ Button handler not found for customId: ${interaction.customId}, prefix: ${prefix}, expected cog: ${cogName}`);
        console.error(`Available cogs:`, Array.from(client.cogs.keys()));
        
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ 
            content: 'Button handler not found! Please contact an administrator.', 
            ephemeral: true 
          });
        }
      }
    } else if (interaction.isStringSelectMenu()) {
      // Handle select menu interactions if needed
      console.log(`📋 Select menu interaction: ${interaction.customId} by ${interaction.user.username}`);
      // Add select menu handling logic here if needed
    }
  } catch (error) {
    console.error('❌ Error handling interaction:', error);
    console.error('Interaction details:', {
      type: interaction.type,
      commandName: interaction.commandName,
      customId: interaction.customId,
      user: interaction.user?.username,
      guild: interaction.guild?.name
    });
    
    const errorMessage = 'An unexpected error occurred! Please try again later.';
    
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ 
          content: errorMessage, 
          ephemeral: true 
        });
      } else if (interaction.deferred) {
        await interaction.followUp({ 
          content: errorMessage, 
          ephemeral: true 
        });
      } else {
        // If already replied, try to edit the reply
        await interaction.editReply({ 
          content: errorMessage 
        });
      }
    } catch (replyError) {
      console.error('❌ Failed to send error message to user:', replyError);
    }
  }
});

// Enhanced error handling
client.on('shardError', error => {
  console.error('❌ WebSocket error:', error);
});

client.on('error', error => {
  console.error('❌ Client error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Client warning:', warning);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Unhandled rejection/exception handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.log('🛑 Shutting down due to uncaught exception...');
  client.destroy();
  process.exit(1);
});

// Login with enhanced error handling
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login:', error);
  if (error.code === 'TokenInvalid') {
    console.error('❌ Invalid DISCORD_TOKEN. Verify it in .env and ensure it matches your bot token from Discord Developer Portal.');
  } else if (error.message.includes('Network')) {
    console.error('❌ Network error. Check your internet connection and try again.');
  } else {
    console.error('❌ Login error details:', error);
  }
  process.exit(1);
});

console.log('🤖 Bot is starting up...');