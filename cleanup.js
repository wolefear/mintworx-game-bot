const { Client, GatewayIntentBits } = require('discord.js');

// Load token from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = '1363087110554390598';

// Add validation
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is required!');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
// ... rest of your code

client.once('ready', async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log('🧹 Starting command cleanup...');
    
    try {
        // Clear global commands
        console.log('🌍 Clearing global commands...');
        const globalCommands = await client.application.commands.fetch();
        console.log(`Found ${globalCommands.size} global commands`);
        await client.application.commands.set([]);
        console.log('✅ Global commands cleared!');
        
        // Clear guild commands
        console.log(`🏠 Clearing guild commands for server ID: ${GUILD_ID}...`);
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            const guildCommands = await guild.commands.fetch();
            console.log(`Found ${guildCommands.size} guild commands in ${guild.name}`);
            await guild.commands.set([]);
            console.log('✅ Guild commands cleared!');
        } else {
            console.log('❌ Could not find guild with that ID');
        }
        
        console.log('🎉 All commands cleared successfully!');
        console.log('💡 You can now restart your main bot - it will register only the current commands.');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error clearing commands:', error);
        process.exit(1);
    }
});

client.login(BOT_TOKEN);