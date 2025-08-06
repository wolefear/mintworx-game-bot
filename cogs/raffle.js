const { SlashCommandBuilder, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('./leveling');

module.exports = {
  name: 'raffle',
  commands: [
    new SlashCommandBuilder()
      .setName('startraffle')
      .setDescription('Start a raffle (Admin only)')
      .addStringOption(option =>
        option.setName('title')
          .setDescription('Raffle title (e.g., Golden Giveaway)')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('spots')
          .setDescription('Number of winner spots')
          .setRequired(true)
          .setMinValue(1))
      .addStringOption(option =>
        option.setName('prize')
          .setDescription('Prize description (e.g., Bera Monks NFT)')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('blockchain')
          .setDescription('Blockchain (e.g., Ethereum)')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('requirements')
          .setDescription('Requirements (e.g., Follow @BeraMonks, Join user#1234, Visit example.com)')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('entry_tokens')
          .setDescription('Tokens to enter raffle')
          .setRequired(true)
          .setMinValue(1))
      .addIntegerOption(option =>
        option.setName('task_tokens')
          .setDescription('Tokens earned for completing tasks')
          .setRequired(true)
          .setMinValue(1))
      .addIntegerOption(option =>
        option.setName('bid_tokens')
          .setDescription('Minimum tokens for bidding (0 to disable)')
          .setRequired(true)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('duration_minutes')
          .setDescription('Raffle duration in minutes')
          .setRequired(true)
          .setMinValue(1))
      .addStringOption(option =>
        option.setName('banner_url')
          .setDescription('Banner image URL (optional)')
          .setRequired(false))
      .setDMPermission(false),
    new SlashCommandBuilder()
      .setName('endraffle')
      .setDescription('End a raffle and announce winners (Admin only)')
      .addStringOption(option =>
        option.setName('raffle_id')
          .setDescription('Raffle ID')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('winners')
          .setDescription('Comma-separated list of winner IDs')
          .setRequired(true))
      .setDMPermission(false)
  ],
  activeRaffles: new Map(),
  formatNumber(number) {
    return `\`${number.toLocaleString()}\``;
  },
  formatTokens(amount) {
    return `\`${amount.toLocaleString()}\` \`$MINT\``;
  },
  parseRequirements(requirements, client) {
    return requirements;
  },
  convertImgurUrl(url) {
    if (!url) return null;
    const imgurPageMatch = url.match(/^https?:\/\/imgur\.com\/([a-zA-Z0-9]+)$/);
    if (imgurPageMatch) {
      return `https://i.imgur.com/${imgurPageMatch[1]}.png`;
    }
    return url;
  },
  selectWinners(entries, spots) {
    const entriesArray = Array.from(entries);
    const winners = [];
    const availableSpots = Math.min(spots, entriesArray.length);
    
    for (let i = 0; i < availableSpots; i++) {
      const randomIndex = Math.floor(Math.random() * entriesArray.length);
      winners.push(entriesArray[randomIndex]);
      entriesArray.splice(randomIndex, 1);
    }
    
    return winners;
  },
  async endRaffleAutomatically(channel, raffleId, raffle) {
    try {
      const winners = this.selectWinners(raffle.entries, raffle.spots);
      const embed = new EmbedBuilder()
        .setTitle(`${raffle.title} - Ended`)
        .setDescription(
          `**Winners**: ${winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'No participants entered the raffle'}\n\n` +
          `🎁 **PRIZES** 🎁\n${this.formatNumber(raffle.spots)} spots for **${raffle.prize}**\n\n` +
          `**Blockchain**\n${raffle.blockchain}\n\n` +
          `*This raffle has ended.*`
        )
        .setColor(0xff0000)
        .setFooter({ text: `Raffle ID: ${raffleId}` })
        .setThumbnail('https://i.imgur.com/oqSl593.png');

      if (raffle.bannerUrl) {
        embed.setImage(this.convertImgurUrl(raffle.bannerUrl));
      }

      try {
        const message = await channel.messages.fetch(raffle.messageId);
        await message.edit({ embeds: [embed], components: [] });
      } catch (error) {
        console.error(`Error fetching/editing raffle message ${raffleId}:`, error);
        await channel.send({ content: `Failed to update raffle message ${raffleId}, but the raffle has ended. Winners: ${winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'None'}` });
      }

      this.activeRaffles.delete(raffleId);
    } catch (error) {
      console.error(`Error auto-ending raffle ${raffleId}:`, error);
      await channel.send({ content: `An error occurred while auto-ending raffle ${raffleId}. Please check logs.` });
    }
  },
  async handleButton(interaction) {
    if (interaction.deferred || interaction.replied) {
      console.log(`Interaction ${interaction.id} already handled, skipping...`);
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const startTime = Date.now();
    console.log(`Processing button interaction ${interaction.id} for user ${interaction.user.id} at ${new Date().toISOString()}`);

    try {
      const [type, action, raffleId] = interaction.customId.split('_');
      if (type !== 'raffle') return;

      const raffle = this.activeRaffles.get(raffleId);
      if (!raffle) {
        await interaction.editReply({ content: 'This raffle has ended!' });
        return;
      }

      if (action === 'enter') {
        if (raffle.entries.has(interaction.user.id)) {
          await interaction.editReply({ content: 'You already entered!' });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        if (raffle.entryTokens <= 0) {
          await interaction.editReply({ content: 'Invalid raffle configuration: Entry tokens must be greater than 0.' });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        await leveling.openAccount(interaction.user);
        if (!(await leveling.removeTokens(interaction.user, raffle.entryTokens))) {
          await interaction.editReply({ content: `Need ${this.formatTokens(raffle.entryTokens)} to enter!` });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        raffle.entries.add(interaction.user.id);
        await interaction.editReply({ content: 'You have successfully entered the raffle!' });
        
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (error) {
            console.log('Could not delete ephemeral reply (likely already expired)');
          }
        }, 20000);
        
        await this.updateRaffleMessage(interaction, raffleId);

      } else if (action === 'bid') {
        if (raffle.bidTokens <= 0) {
          await interaction.editReply({ content: 'Bidding is disabled for this raffle!' });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        if (raffle.bids.has(interaction.user.id)) {
          await interaction.editReply({ content: 'You already placed a bid!' });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        await leveling.openAccount(interaction.user);
        const bidAmount = raffle.bidTokens;
        if (!(await leveling.removeTokens(interaction.user, bidAmount))) {
          await interaction.editReply({ content: `Need ${this.formatTokens(bidAmount)} to bid!` });
          
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (error) {
              console.log('Could not delete ephemeral reply (likely already expired)');
            }
          }, 20000);
          return;
        }

        raffle.bids.set(interaction.user.id, bidAmount);
        await interaction.editReply({ content: `You placed a bid of ${this.formatTokens(bidAmount)}!` });
        
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (error) {
            console.log('Could not delete ephemeral reply (likely already expired)');
          }
        }, 20000);
        
        await this.updateRaffleMessage(interaction, raffleId);
      }
    } catch (error) {
      console.error(`Error handling raffle button ${interaction.customId}:`, error);
      try {
        await interaction.editReply({ content: 'An error occurred while processing the button!' });
      } catch (followUpError) {
        console.error('Error sending button error reply:', followUpError);
        if (followUpError.code === 10062) {
          await interaction.followUp({ content: `An error occurred for ${interaction.user.username}. Please try again.`, ephemeral: true });
        }
      }
    }
    console.log(`Button interaction ${interaction.id} processed in ${Date.now() - startTime}ms`);
  },
  async updateRaffleMessage(interaction, raffleId) {
    const raffle = this.activeRaffles.get(raffleId);
    if (!raffle) return;

    const biddingSection = raffle.bidTokens > 0 ?
      `\n\n💰 **BIDDING** 💰\n\nWant to boost your chances? Place a bid with **\`$MINT\`!** *One bid only — make it count.*\n\n**Current Bids**: ${this.formatNumber(raffle.bids.size)}` : '';

    const embed = new EmbedBuilder()
      .setTitle(raffle.title)
      .setDescription(
        `🎁 **PRIZES** 🎁\n${this.formatNumber(raffle.spots)} spots for **${raffle.prize}**\n\n` +
        `🎫 **RAFFLE** 🎫\n\nComplete the following tasks to earn up to ${this.formatTokens(raffle.taskTokens)} and get a chance to win the following raffle:\n` +
        `**${raffle.prize}**: ${this.formatNumber(raffle.spots)} spots\n\n` +
        `**Current Entries**: ${this.formatNumber(raffle.entries.size)}` +
        biddingSection +
        `\n\n**Requirements**\n${this.parseRequirements(raffle.requirements, interaction.client)}\n\n` +
        `*Note: Requirements may be checked again at any time and winners will be rerolled if they didn't meet them.*\n\n` +
        `**Ends**\n${new Date(raffle.endTime).toLocaleString()}\n\n` +
        `**Blockchain**\n${raffle.blockchain}`
      )
      .setColor(0xffd700)
      .setFooter({ text: `Raffle ID: ${raffleId}` })
      .setThumbnail('https://i.imgur.com/oqSl593.png');

    if (raffle.bannerUrl) {
      embed.setImage(this.convertImgurUrl(raffle.bannerUrl));
    }

    const buttons = [
      new ButtonBuilder().setCustomId(`raffle_enter_${raffleId}`).setLabel('Join Raffle').setStyle(ButtonStyle.Primary)
    ];
    if (raffle.bidTokens > 0) {
      buttons.push(new ButtonBuilder().setCustomId(`raffle_bid_${raffleId}`).setLabel('Place Bid').setStyle(ButtonStyle.Secondary));
    }
    const row = new ActionRowBuilder().addComponents(buttons);

    try {
      const message = await interaction.channel.messages.fetch(raffle.messageId);
      await message.edit({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error(`Error updating raffle message ${raffleId}:`, error);
      try {
        await interaction.followUp({ content: 'Failed to update raffle message!', ephemeral: true });
      } catch (followUpError) {
        console.error('Error sending raffle message update error:', followUpError);
        if (followUpError.code === 10062) {
          await interaction.followUp({ content: 'Failed to update raffle message. Please try again.', ephemeral: true });
        }
      }
    }
  },
  async execute(interaction) {
    if (interaction.deferred || interaction.replied) {
      console.log(`Interaction ${interaction.id} already handled, skipping...`);
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const startTime = Date.now();
    console.log(`Processing command ${interaction.commandName} for user ${interaction.user.id} at ${new Date().toISOString()}`);

    try {
      if (interaction.commandName === 'startraffle') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.editReply({ content: 'Only admins can start raffles!' });
          return;
        }

        const entryTokens = interaction.options.getInteger('entry_tokens');
        const taskTokens = interaction.options.getInteger('task_tokens');
        const bidTokens = interaction.options.getInteger('bid_tokens');
        if (entryTokens <= 0 || taskTokens <= 0) {
          await interaction.editReply({ content: 'Entry tokens and task tokens must be greater than 0!' });
          return;
        }

        const raffleId = Date.now().toString();
        const durationMinutes = interaction.options.getInteger('duration_minutes');
        const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
        const bannerUrl = interaction.options.getString('banner_url');
        const raffle = {
          title: interaction.options.getString('title'),
          spots: interaction.options.getInteger('spots'),
          prize: interaction.options.getString('prize'),
          blockchain: interaction.options.getString('blockchain'),
          requirements: interaction.options.getString('requirements'),
          entryTokens,
          taskTokens,
          bidTokens,
          endTime,
          bannerUrl: bannerUrl || null,
          entries: new Set(),
          bids: new Map(),
          messageId: null,
          timerId: null // Store timer ID for cleanup
        };

        this.activeRaffles.set(raffleId, raffle);

        const biddingSection = raffle.bidTokens > 0 ?
          `\n\n💰 **BIDDING** 💰\n\nWant to boost your chances? Place a bid with **\`$MINT\`!** *One bid only — make it count.*\n\n**Current Bids**: ${this.formatNumber(0)}` : '';

        const embed = new EmbedBuilder()
          .setTitle(raffle.title)
          .setDescription(
            `🎁 **PRIZES** 🎁\n${this.formatNumber(raffle.spots)} spots for **${raffle.prize}**\n\n` +
            `🎫 **RAFFLE** 🎫\n\nComplete the following tasks to earn up to ${this.formatTokens(raffle.taskTokens)} and get a chance to win the following raffle:\n` +
            `**${raffle.prize}**: ${this.formatNumber(raffle.spots)} spots\n\n` +
            `**Current Entries**: ${this.formatNumber(0)}` +
            biddingSection +
            `\n\n**Requirements**\n${this.parseRequirements(raffle.requirements, interaction.client)}\n\n` +
            `*Note: Requirements may be checked again at any time and winners will be rerolled if they didn't meet them.*\n\n` +
            `**Ends**\n${raffle.endTime.toLocaleString()}\n\n` +
            `**Blockchain**\n${raffle.blockchain}`
          )
          .setColor(0xffd700)
          .setFooter({ text: `Raffle ID: ${raffleId}` })
          .setThumbnail('https://i.imgur.com/oqSl593.png');

        if (raffle.bannerUrl) {
          embed.setImage(this.convertImgurUrl(raffle.bannerUrl));
        }

        const buttons = [
          new ButtonBuilder().setCustomId(`raffle_enter_${raffleId}`).setLabel('Join Raffle').setStyle(ButtonStyle.Primary)
        ];
        if (raffle.bidTokens > 0) {
          buttons.push(new ButtonBuilder().setCustomId(`raffle_bid_${raffleId}`).setLabel('Place Bid').setStyle(ButtonStyle.Secondary));
        }
        const row = new ActionRowBuilder().addComponents(buttons);

        try {
          const message = await interaction.channel.send({ embeds: [embed], components: [row] });
          this.activeRaffles.get(raffleId).messageId = message.id;
          await interaction.editReply({ content: `Raffle started! ID: ${raffleId}` });

          // Schedule automatic raffle end and store timer ID
          const timerId = setTimeout(() => this.endRaffleAutomatically(interaction.channel, raffleId, raffle), durationMinutes * 60 * 1000);
          this.activeRaffles.get(raffleId).timerId = timerId;
        } catch (error) {
          console.error(`Error sending raffle message ${raffleId}:`, error);
          this.activeRaffles.delete(raffleId);
          await interaction.editReply({ content: 'Failed to start raffle!' });
          return;
        }

      } else if (interaction.commandName === 'endraffle') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.editReply({ content: 'Only admins can end raffles!' });
          return;
        }

        const raffleId = interaction.options.getString('raffle_id');
        const raffle = this.activeRaffles.get(raffleId);
        if (!raffle) {
          await interaction.editReply({ content: 'Raffle not found!' });
          return;
        }

        // Clear the automatic timer to prevent duplicate execution
        if (raffle.timerId) {
          clearTimeout(raffle.timerId);
        }

        const winnerIds = interaction.options.getString('winners').split(',').map(id => id.trim());
        
        const winners = [];
        for (const winnerId of winnerIds) {
          let userId = winnerId;
          
          if (winnerId.startsWith('<@') && winnerId.endsWith('>')) {
            userId = winnerId.slice(2, -1);
            if (userId.startsWith('!')) {
              userId = userId.slice(1);
            }
          }
          
          let user = interaction.client.users.cache.get(userId);
          
          if (!user) {
            try {
              user = await interaction.client.users.fetch(userId);
              console.log(`✅ Fetched user from API: ${user.username} (${user.id})`);
            } catch (error) {
              console.error(`❌ Failed to fetch user ${userId}:`, error);
              user = { id: userId, username: `User-${userId}`, tag: `User-${userId}#0000` };
            }
          }
          
          if (user) {
            winners.push(user);
          }
        }

        const embed = new EmbedBuilder()
          .setTitle(`${raffle.title} - Ended`)
          .setDescription(
            `**Winners**: ${winners.length > 0 ? winners.map(w => `<@${w.id}>`).join(', ') : 'None'}\n\n` +
            `🎁 **PRIZES** 🎁\n${this.formatNumber(raffle.spots)} spots for **${raffle.prize}**\n\n` +
            `**Blockchain**\n${raffle.blockchain}\n\n` +
            `*This raffle has ended.*`
          )
          .setColor(0xff0000)
          .setFooter({ text: `Raffle ID: ${raffleId}` })
          .setThumbnail('https://i.imgur.com/oqSl593.png');

        if (raffle.bannerUrl) {
          embed.setImage(this.convertImgurUrl(raffle.bannerUrl));
        }

        try {
          const message = await interaction.channel.messages.fetch(raffle.messageId);
          await message.edit({ embeds: [embed], components: [] });
          await interaction.editReply({ content: 'Raffle ended successfully!' });
        } catch (error) {
          console.error(`Error updating raffle end message ${raffleId}:`, error);
          await interaction.editReply({ content: 'Failed to end raffle!' });
          return;
        }

        this.activeRaffles.delete(raffleId);
      }
    } catch (error) {
      console.error(`Error executing raffle command ${interaction.commandName}:`, error);
      try {
        await interaction.editReply({ content: 'An error occurred while executing the command!' });
      } catch (replyError) {
        console.error('Error sending command error reply:', replyError);
        if (replyError.code === 10062) {
          await interaction.followUp({ content: `An error occurred for ${interaction.user.username}. Please try again.`, ephemeral: true });
        }
      }
    }
    console.log(`Command ${interaction.commandName} processed in ${Date.now() - startTime}ms`);
  }
};