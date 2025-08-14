const { Client, GatewayIntentBits, Collection, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { cleanup } = require('./cogs/cleanup');
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
client.cogs = new Collection();
const cogs = ['leveling', 'games', 'raffle', 'shop', 'giftmint'];

// Collect commands for registration
const commands = [];
cogs.forEach(cogName => {
  try {
    const cog = require(`./cogs/${cogName}`);
    if (!cog.commands || !Array.isArray(cog.commands)) {
      console.error(`Error: Cog ${cogName} does not export a valid commands array`);
      return;
    }
    
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
    
    console.log(`✅ Successfully loaded cog: ${cogName}`);
  } catch (error) {
    console.error(`❌ Failed to load cog ${cogName}:`, error);
  }
});

// Register commands with Discord API
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
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
      
      let cogName;
      if (prefix === 'meltdown') {
        cogName = 'games';
      } else if (prefix === 'buy') {
        cogName = 'shop';
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
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
        }
      }
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
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await cleanup(client);
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await cleanup(client);
  client.destroy();
  process.exit(0);
});

// Unhandled rejection/exception handling
process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.log('🛑 Shutting down due to uncaught exception...');
  await cleanup(client);
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