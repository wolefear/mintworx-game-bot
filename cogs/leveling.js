const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;

module.exports = {
  name: 'leveling',
  commands: [
    new SlashCommandBuilder()
      .setName('port')
      .setDescription('Check your XP and $MINT balance')
      .setDMPermission(false),
    new SlashCommandBuilder()
      .setName('top')
      .setDescription('View top 10 players by XP (Admin only)')
      .setDMPermission(false)
  ],
  // Function to format tokens consistently with $MINT
  formatTokens(amount) {
    return `\`${amount.toLocaleString()}\` \`$MINT\``;
  },
  async loadData() {
    try {
      const data = await fs.readFile('./data/users.json', 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty object and create it
        console.log('users.json not found, creating new file...');
        await this.ensureDataDirectory();
        return {};
      }
      console.error('Error loading user data:', error);
      return {};
    }
  },
  async saveData(data) {
    try {
      await this.ensureDataDirectory();
      await fs.writeFile('./data/users.json', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving user data:', error);
      throw error; // Re-throw so calling functions know it failed
    }
  },
  async ensureDataDirectory() {
    try {
      await fs.access('./data');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('Creating data directory...');
        await fs.mkdir('./data', { recursive: true });
      }
    }
  },
  async openAccount(user) {
    if (!user || !user.id) {
      console.error('Invalid user object passed to openAccount:', user);
      return {};
    }
    try {
      const data = await this.loadData();
      if (!data[user.id]) {
        console.log(`Creating new account for user: ${user.username || user.id}`);
        data[user.id] = { xp: 0, level: 0, tokens: 0 };
        await this.saveData(data);
        console.log(`✅ Successfully created account for user: ${user.username || user.id}`);
      }
      return data;
    } catch (error) {
      console.error('Error in openAccount:', error);
      // Return empty object with the user initialized to prevent crashes
      const fallbackData = {};
      fallbackData[user.id] = { xp: 0, level: 0, tokens: 0 };
      return fallbackData;
    }
  },
  async addXP(user, xp) {
    if (!user || !user.id) {
      console.error('Invalid user object passed to addXP:', user);
      return [false, 0];
    }
    try {
      const data = await this.openAccount(user);
      
      // Double-check that the user exists in the data after openAccount
      if (!data[user.id]) {
        console.error('User still not found after openAccount, manually creating:', user.id);
        data[user.id] = { xp: 0, level: 0, tokens: 0 };
      }
      
      data[user.id].xp += xp;
      const levelStart = data[user.id].level;
      const levelEnd = Math.floor(data[user.id].xp ** 0.25);
      if (levelStart < levelEnd) {
        data[user.id].level = levelEnd;
        await this.saveData(data);
        console.log(`🎉 ${user.username || user.id} leveled up to level ${levelEnd}!`);
        return [true, levelEnd];
      }
      await this.saveData(data);
      console.log(`✅ Added ${xp} XP to ${user.username || user.id} (total: ${data[user.id].xp})`);
      return [false, levelEnd];
    } catch (error) {
      console.error('Error in addXP:', error);
      return [false, 0];
    }
  },
  async addTokens(user, tokens) {
    if (!user || !user.id) {
      console.error('Invalid user object passed to addTokens:', user);
      return false;
    }
    if (typeof tokens !== 'number' || tokens <= 0) {
      console.error('Invalid token amount passed to addTokens:', tokens);
      return false;
    }
    try {
      const data = await this.openAccount(user);
      
      // Double-check that the user exists in the data after openAccount
      if (!data[user.id]) {
        console.error('User still not found after openAccount, manually creating:', user.id);
        data[user.id] = { xp: 0, level: 0, tokens: 0 };
      }
      
      console.log(`Adding ${tokens} $MINT tokens to user ${user.username || user.id} (current: ${data[user.id].tokens})`);
      data[user.id].tokens += tokens;
      await this.saveData(data);
      console.log(`✅ Successfully added ${tokens} $MINT tokens to ${user.username || user.id} (new total: ${data[user.id].tokens})`);
      return true;
    } catch (error) {
      console.error('Error in addTokens:', error);
      return false;
    }
  },
  async removeTokens(user, tokens) {
    if (!user || !user.id) {
      console.error('Invalid user object passed to removeTokens:', user);
      return false;
    }
    if (typeof tokens !== 'number' || tokens <= 0) {
      console.error('Invalid token amount passed to removeTokens:', tokens);
      return false;
    }
    try {
      const data = await this.openAccount(user);
      
      // Double-check that the user exists in the data after openAccount
      if (!data[user.id]) {
        console.error('User still not found after openAccount, manually creating:', user.id);
        data[user.id] = { xp: 0, level: 0, tokens: 0 };
      }
      
      console.log(`Attempting to remove ${tokens} $MINT tokens from user ${user.username || user.id} (current: ${data[user.id].tokens})`);
      
      if (data[user.id].tokens < tokens) {
        console.log(`❌ Insufficient $MINT tokens for ${user.username || user.id}: needs ${tokens}, has ${data[user.id].tokens}`);
        return false; // Insufficient tokens
      }
      
      data[user.id].tokens -= tokens;
      await this.saveData(data);
      console.log(`✅ Successfully removed ${tokens} $MINT tokens from ${user.username || user.id} (new total: ${data[user.id].tokens})`);
      return true;
    } catch (error) {
      console.error('Error in removeTokens:', error);
      return false;
    }
  },
  async getBalance(user) {
    if (!user || !user.id) {
      console.error('Invalid user object passed to getBalance:', user);
      return { xp: 0, level: 0, tokens: 0 };
    }
    try {
      const data = await this.openAccount(user);
      return data[user.id] || { xp: 0, level: 0, tokens: 0 };
    } catch (error) {
      console.error('Error in getBalance:', error);
      return { xp: 0, level: 0, tokens: 0 };
    }
  },
  async execute(interaction) {
    try {
      const data = await this.loadData();
      if (interaction.commandName === 'port') {
        const userData = data[interaction.user.id] || { xp: 0, level: 0, tokens: 0 };
        const embed = {
          title: `${interaction.user.username}'s Portfolio`,
          color: 0x0099ff,
          thumbnail: {
            url: 'https://i.imgur.com/oqSl593.png'
          },
          fields: [
            { name: 'XP', value: `\`${userData.xp.toLocaleString()}\``, inline: true },
            { name: 'Level', value: `\`${userData.level.toString()}\``, inline: true },
            { name: '$MINT', value: `\`${userData.tokens.toLocaleString()}\``, inline: true }
          ]
        };
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (interaction.commandName === 'top') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: 'Only admins can use this command!', ephemeral: true });
          return;
        }
        const sorted = Object.entries(data)
          .sort(([, a], [, b]) => b.xp - a.xp)
          .slice(0, 10);
        
        if (sorted.length === 0) {
          await interaction.reply({ 
            content: 'No players found in the database!', 
            ephemeral: true 
          });
          return;
        }

        const embed = {
          title: 'Top 10 Players',
          color: 0xffd700,
          thumbnail: {
            url: 'https://i.imgur.com/oqSl593.png'
          },
          fields: sorted.map(([userId, info], i) => {
            const user = interaction.client.users.cache.get(userId);
            return {
              name: `${i + 1}. ${user?.username || 'Unknown User'}`,
              value: `Level: \`${info.level}\` | XP: \`${info.xp.toLocaleString()}\` | $MINT: \`${info.tokens.toLocaleString()}\``,
              inline: false
            };
          })
        };
        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing leveling command:', error);
      await interaction.reply({ 
        content: 'An error occurred while executing the command!', 
        ephemeral: true 
      });
    }
  }
};