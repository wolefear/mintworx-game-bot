const { SlashCommandBuilder, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const leveling = require('./leveling');

// Game state storage
const activeGames = new Map();

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('startmeltdown')
    .setDescription('Start a Market Meltdown event (Admin only)')
    .addIntegerOption(option =>
      option
        .setName('pot')
        .setDescription('Total $MINT pot for the game')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
];

// Function to format tokens consistently with $MINT
function formatTokens(amount) {
  return `\`${amount.toLocaleString()}\` \`$MINT\``;
}

// Function to convert Imgur page URLs to direct image URLs
function convertImgurUrl(url) {
  if (!url) return null;
  
  // Check if it's an Imgur page URL (not direct image URL)
  const imgurPageMatch = url.match(/^https?:\/\/imgur\.com\/([a-zA-Z0-9]+)$/);
  if (imgurPageMatch) {
    // Convert to direct image URL - default to .png, but you can specify the extension
    return `https://i.imgur.com/${imgurPageMatch[1]}.png`;
  }
  
  // If it's already a direct image URL or not an Imgur URL, return as-is
  return url;
}

// Helper: Update Market Meltdown registration message
async function updateRegistrationMessage(interaction, gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;
  const share = game.players.size > 0 ? Math.floor(game.pot / game.players.size) : game.pot;
  const embed = {
    title: 'Market Meltdown',
    description: `⛏️ REGISTRATION PHASE!\n` +
                 `💎 You have 30 seconds to join the game!\n\n` +
                 `🏆 Prize Pool: ${formatTokens(game.pot)}\n` +
                 `💰 Pot will be shared equally among all participants!\n` +
                 `⏱ 30-second cooldown between registrations!\n` +
                 `**Players**: ${game.players.size}`,
    color: 0x800080,
    thumbnail: {
      url: 'https://i.imgur.com/oqSl593.png'
    }
  };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`meltdown_join_${gameId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Primary)
  );
  try {
    await interaction.channel.messages.fetch(game.messageId).then(msg =>
      msg.edit({ embeds: [embed], components: [row] })
    );
  } catch (error) {
    console.error('Error updating registration message:', error);
  }
}

// Helper: Update Market Meltdown investment message
async function updateInvestmentMessage(interaction, gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;
  const share = Math.floor(game.pot / game.players.size);
  const investedCount = Array.from(game.players.values()).filter(p => p.investment > 0).length;
  const embed = {
    title: 'Market Meltdown',
    description: `💰 INVESTMENT PHASE\n` +
                 `📈 Market is now open!\n\n` +
                 `💎 Click INVEST to invest your ${formatTokens(share)} from the pot.\n` +
                 `⏰ You have 30 seconds!\n` +
                 `**Players Invested**: ${investedCount}`,
    color: 0x800080,
    thumbnail: {
      url: 'https://i.imgur.com/oqSl593.png'
    }
  };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`meltdown_invest_${gameId}`)
      .setLabel('Invest')
      .setStyle(ButtonStyle.Primary)
  );
  try {
    await interaction.channel.messages.fetch(game.messageId).then(msg =>
      msg.edit({ embeds: [embed], components: [row] })
    );
  } catch (error) {
    console.error('Error updating investment message:', error);
  }
}

// Helper: Update Market Meltdown voting message
async function updateVotingMessage(interaction, gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;
  
  let withdrawDescription = '';
  if (game.round >= 2) {
    withdrawDescription = `\n**🏦 WITHDRAW**\nWithdraw the $MINT pot and divide it among remaining players\n`;
  }
  
  const embed = {
    title: `Market Meltdown Round ${game.round}`,
    description: `📊 MARKET MELTDOWN ROUND ${game.round}\n` +
                 `The market is volatile! You have 60 seconds to make your trading decision\n\n` +
                 `🚀 **Pump**\n` +
                 `Believe in the market! Double the token pool if majority pumps\n\n` +
                 `📉 **Dump**\n` +
                 `Take 10% from the pool and exit (Market crashes if >50% dump)` +
                 withdrawDescription +
                 `\n💰 **Market Pool**\n` +
                 `${formatTokens(game.pool)}`,
    color: 0x800080,
    thumbnail: {
      url: 'https://i.imgur.com/oqSl593.png'
    }
  };
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`meltdown_pump_${gameId}`)
      .setLabel('PUMP')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`meltdown_dump_${gameId}`)
      .setLabel('DUMP')
      .setStyle(ButtonStyle.Danger),
  ];
  if (game.round >= 2) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`meltdown_withdraw_${gameId}`)
        .setLabel('WITHDRAW')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  const row = new ActionRowBuilder().addComponents(buttons);
  try {
    const message = await interaction.channel.send({
      embeds: [embed], 
      components: [row]
    });
    // Update the stored message ID to the new voting message
    activeGames.get(gameId).messageId = message.id;
  } catch (error) {
    console.error('Error updating voting message:', error);
  }
}

// Handle Market Meltdown buttons
async function handleMeltdownButton(interaction, action, gameId) {
  const game = activeGames.get(gameId);
  if (!game) {
    await interaction.reply({ content: 'This game has ended!', ephemeral: true });
    
    // Auto-delete the ephemeral message after 20 seconds
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        console.log('Could not delete ephemeral reply (likely already expired)');
      }
    }, 20000);
    return;
  }
  
  if (action === 'join') {
    if (game.phase !== 'registration') {
      await interaction.reply({ content: 'Registration is closed!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    if (game.players.has(interaction.user.id)) {
      await interaction.reply({ content: 'You already joined!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    // No $MINT requirement for joining
    game.players.set(interaction.user.id, { investment: 0, withdrawn: false });
    await interaction.reply({ content: 'Joined Market Meltdown!', ephemeral: true });
    
    // Auto-delete the ephemeral message after 20 seconds
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        console.log('Could not delete ephemeral reply (likely already expired)');
      }
    }, 20000);
    
    await updateRegistrationMessage(interaction, gameId);
    
  } else if (action === 'invest') {
    if (game.phase !== 'investment') {
      await interaction.reply({ content: 'Investment phase is over!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    if (!game.players.has(interaction.user.id)) {
      await interaction.reply({ content: "You didn't join the game!", ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    const player = game.players.get(interaction.user.id);
    if (player.investment > 0) {
      await interaction.reply({ content: 'You already invested!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    const share = Math.floor(game.pot / game.players.size);
    if (!(await leveling.removeTokens(interaction.user, share))) {
      await interaction.reply({ content: `Need ${formatTokens(share)} to invest!`, ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    game.players.get(interaction.user.id).investment = share;
    game.pool += share;
    await interaction.reply({ content: `Invested ${formatTokens(share)}!`, ephemeral: true });
    
    // Auto-delete the ephemeral message after 20 seconds
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        console.log('Could not delete ephemeral reply (likely already expired)');
      }
    }, 20000);
    
    await updateInvestmentMessage(interaction, gameId);
    
  } else if (['pump', 'dump', 'withdraw'].includes(action)) {
    if (game.phase !== 'voting' || (action === 'withdraw' && game.round < 2)) {
      await interaction.reply({ content: 'Invalid action for this phase!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    if (!game.players.has(interaction.user.id)) {
      await interaction.reply({ content: "You didn't join the game!", ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    const player = game.players.get(interaction.user.id);
    if (player.withdrawn || player.investment === 0) {
      await interaction.reply({ content: "You can't vote!", ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    if (game.votes.has(interaction.user.id)) {
      await interaction.reply({ content: 'You already voted this round!', ephemeral: true });
      
      // Auto-delete the ephemeral message after 20 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          console.log('Could not delete ephemeral reply (likely already expired)');
        }
      }, 20000);
      return;
    }
    game.votes.set(interaction.user.id, action);
    await interaction.reply({ content: `Voted to ${action.toUpperCase()}!`, ephemeral: true });
    
    // Auto-delete the ephemeral message after 20 seconds
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        console.log('Could not delete ephemeral reply (likely already expired)');
      }
    }, 20000);
  }
}

// Execute commands
async function execute(interaction) {
  try {
    if (interaction.commandName === 'startmeltdown') {
      if (!interaction.member) {
        await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
        return;
      }
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'Only admins can start this event!', ephemeral: true });
        return;
      }
      const pot = interaction.options.getInteger('pot');
      if (pot <= 0) {
        await interaction.reply({ content: 'Pot must be positive!', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const gameId = Date.now().toString();
      activeGames.set(gameId, {
        phase: 'registration',
        pot,
        pool: 0,
        round: 0,
        multiplier: 1.0,
        players: new Map(),
        votes: new Map(),
        messageId: null,
        crashed: false,
        channelId: interaction.channelId,
      });

      // Step 1: Initial announcement message
      const initialEmbed = {
        title: 'Market Meltdown',
        description: `📈 Market Meltdown!\n` + 
                     `Prize pot: ${formatTokens(pot)}\n\n` + 
                     `⛏️ REGISTRATION PHASE starting now!`,
        color: 0x800080,
        thumbnail: {
          url: 'https://i.imgur.com/oqSl593.png'
        }
      };
      try {
        await interaction.channel.send({ embeds: [initialEmbed] });
      } catch (error) {
        console.error('Error sending initial Market Meltdown message:', error);
        await interaction.followUp({ content: 'Failed to send initial message!', ephemeral: true });
        return;
      }

      // Step 2: Registration phase message with button
      const registrationEmbed = {
        title: 'Market Meltdown',
        description: `⛏️ REGISTRATION PHASE!\n` +
                     `💎 You have 30 seconds to join the game!\n\n` +
                     `🏆 Prize Pool: ${formatTokens(pot)}\n` +
                     `💰 Pot will be shared equally among all participants!\n` +
                     `⏱ 30-second cooldown between registrations!\n` +
                     `**Players**: 0`,
        color: 0x800080,
        thumbnail: {
          url: 'https://i.imgur.com/oqSl593.png'
        }
      };
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`meltdown_join_${gameId}`)
          .setLabel('Join')
          .setStyle(ButtonStyle.Primary)
      );
      try {
        const message = await interaction.channel.send({
          embeds: [registrationEmbed],
          components: [row],
          fetchReply: true,
        });
        activeGames.get(gameId).messageId = message.id;
      } catch (error) {
        console.error('Error sending registration message:', error);
        await interaction.followUp({ content: 'Failed to start registration phase!', ephemeral: true });
        return;
      }
      await interaction.followUp({ content: 'Market Meltdown started!', ephemeral: true });

      // Registration phase timer (30 seconds)
      const updateInterval = setInterval(() => updateRegistrationMessage(interaction, gameId), 3000);
      setTimeout(async () => {
        clearInterval(updateInterval);
        const game = activeGames.get(gameId);
        if (!game || game.players.size === 0) {
          if (game) {
            const embed = {
              title: 'Market Meltdown',
              description: `⏰ REGISTRATION PHASE ENDED!\n` +
                           `🎉 0 players joined!\n` +
                           `💰 Game cancelled: No players.`,
              color: 0xff0000,
              thumbnail: {
                url: 'https://i.imgur.com/oqSl593.png'
              }
            };
            try {
              await interaction.channel.messages.fetch(game.messageId).then(msg =>
                msg.edit({ embeds: [embed], components: [] })
              );
            } catch (error) {
              console.error('Error cancelling Market Meltdown:', error);
            }
            activeGames.delete(gameId);
          }
          return;
        }

        // Step 3: Registration ended message
        const share = Math.floor(game.pot / game.players.size);
        const endRegistrationEmbed = {
          title: 'Market Meltdown',
          description: `⏰ REGISTRATION PHASE ENDED!\n` +
                       `🎉 ${game.players.size} players joined!\n` +
                       `💰 Each player receives ${formatTokens(share)} from the pot to invest!`,
          color: 0x800080,
          thumbnail: {
            url: 'https://i.imgur.com/oqSl593.png'
          }
        };
        try {
          await interaction.channel.messages.fetch(game.messageId).then(msg =>
            msg.edit({ embeds: [endRegistrationEmbed], components: [] })
          );
        } catch (error) {
          console.error('Error sending registration end message:', error);
        }

        // Distribute pot tokens to players
        for (const [userId] of game.players) {
          try {
            const user = interaction.client.users.cache.get(userId);
            if (user) {
              console.log(`💰 Distributing ${share} $MINT tokens to ${user.username} (${userId})`);
              await leveling.addTokens(user, share);
            } else {
              console.error(`❌ Could not find user object for ID: ${userId}`);
            }
          } catch (error) {
            console.error(`❌ Error adding $MINT tokens to user ${userId}:`, error);
          }
        }

        // Step 4: Investment phase
        game.phase = 'investment';
        await updateInvestmentMessage(interaction, gameId);

        // Investment phase timer (30 seconds)
        setTimeout(async () => {
          const game = activeGames.get(gameId);
          if (!game) return;
          const investedCount = Array.from(game.players.values()).filter(p => p.investment > 0).length;
          
          if (investedCount === 0) {
            const embed = {
              title: 'Market Meltdown',
              description: `📈 CRYPTO MARKET OPENED!\n` +
                           `🏦 0 traders have invested in the market!\n` +
                           `💰 Market pool: 0 $MINT\n\n` +
                           `Game cancelled: No investments.`,
              color: 0xff0000,
              thumbnail: {
                url: 'https://i.imgur.com/oqSl593.png'
              }
            };
            try {
              await interaction.channel.messages.fetch(game.messageId).then(msg =>
                msg.edit({ embeds: [embed], components: [] })
              );
            } catch (error) {
              console.error('Error cancelling Market Meltdown:', error);
            }
            activeGames.delete(gameId);
            return;
          }

          // Step 5: Investment ended message
          const investmentEndEmbed = {
            title: 'Market Meltdown',
            description: `📈 CRYPTO MARKET OPENED!\n` +
                         `🏦 ${investedCount} traders have invested in the market!\n` +
                         `💰 Market pool: ${formatTokens(game.pool)}`,
            color: 0x800080,
            thumbnail: {
              url: 'https://i.imgur.com/oqSl593.png'
            }
          };
          try {
            await interaction.channel.messages.fetch(game.messageId).then(msg =>
              msg.edit({ embeds: [investmentEndEmbed], components: [] })
            );
          } catch (error) {
            console.error('Error sending investment end message:', error);
          }

          // Step 6: Start voting rounds
          game.phase = 'voting';
          game.round = 1;
          
          // Game loop
          while (activeGames.has(gameId)) {
            const currentGame = activeGames.get(gameId);
            if (!currentGame || currentGame.crashed || currentGame.players.size === 0) break;

            await updateVotingMessage(interaction, gameId);
            await new Promise(resolve => setTimeout(resolve, 60000)); // 60s per round

            const game = activeGames.get(gameId);
            if (!game) break;

            // Process votes
            let pumpVotes = 0, dumpVotes = 0, withdrawVotes = 0;
            const dumpedPlayers = [];
            const withdrawnPlayers = [];
            
            const activePlayerIds = Array.from(game.players.keys()).filter(id => {
              const player = game.players.get(id);
              return player.investment > 0 && !player.withdrawn;
            });

            for (const [userId, vote] of game.votes) {
              if (!activePlayerIds.includes(userId)) continue;
              
              if (vote === 'pump') pumpVotes++;
              else if (vote === 'dump') dumpVotes++;
              else if (vote === 'withdraw' && game.round >= 2) {
                withdrawVotes++;
                const player = game.players.get(userId);
                if (player && !player.withdrawn) {
                  player.withdrawn = true;
                  const winnings = Math.floor(player.investment * game.multiplier);
                  const user = interaction.client.users.cache.get(userId);
                  if (user) {
                    withdrawnPlayers.push({ user, winnings });
                    try {
                      await leveling.addTokens(user, winnings);
                      await leveling.addXP(user, Math.floor(winnings / 10));
                    } catch (error) {
                      console.error(`Error rewarding user ${userId}:`, error);
                    }
                  }
                }
              }
            }

            // Show voting results
            const voteResultsEmbed = {
              title: `Market Meltdown Round ${game.round}`,
              description: `**ROUND ${game.round}** Voting machine go "BRRRRR" and the results are in!\n\n` +
                          `🚀 Pump: \`${pumpVotes}\` players\n` +
                          `📉 Dump: \`${dumpVotes}\` players` +
                          (game.round >= 2 ? `\n🏦 Withdraw: \`${withdrawVotes}\` players` : ''),
              color: 0x800080,
              thumbnail: {
                url: 'https://i.imgur.com/oqSl593.png'
              }
            };
            
            try {
              await interaction.channel.send({ embeds: [voteResultsEmbed] });
            } catch (error) {
              console.error('Error sending vote results:', error);
            }

            // Handle dump votes
            for (const [userId, vote] of game.votes) {
              if (vote === 'dump' && activePlayerIds.includes(userId)) {
                const player = game.players.get(userId);
                if (player && !player.withdrawn) {
                  const dumpReward = Math.floor(game.pool * 0.1);
                  const user = interaction.client.users.cache.get(userId);
                  if (user) {
                    dumpedPlayers.push({ user, reward: dumpReward });
                    try {
                      await leveling.addTokens(user, dumpReward);
                      await leveling.addXP(user, Math.floor(dumpReward / 10));
                    } catch (error) {
                      console.error(`Error rewarding dump user ${userId}:`, error);
                    }
                  }
                  player.withdrawn = true;
                  game.pool -= dumpReward;
                }
              }
            }

            // Show dumped players message
            if (dumpedPlayers.length > 0) {
              const dumpedPlayersEmbed = {
                title: `Market Meltdown Round ${game.round}`,
                description: `**ROUND ${game.round}**\n"It appears there are some jeets in the market"\n\n` +
                            `The following players have each successfully dumped but are now out of the game:\n` +
                            dumpedPlayers.map(p => `• ${p.user.username} - ${formatTokens(p.reward)}`).join('\n'),
                color: 0xff4444,
                thumbnail: {
                  url: 'https://i.imgur.com/oqSl593.png'
                }
              };
              
              try {
                await interaction.channel.send({ embeds: [dumpedPlayersEmbed] });
              } catch (error) {
                console.error('Error sending dumped players message:', error);
              }
            }

            // Remove withdrawn players
            game.players.forEach((player, userId) => {
              if (player.withdrawn) game.players.delete(userId);
            });

            game.votes.clear();

            // Market mechanics
            const majorityPump = pumpVotes > dumpVotes;
            if (majorityPump) {
              game.pool *= 2;
              game.multiplier += 0.5;
            } else {
              game.multiplier -= 0.2;
            }

            // Crash conditions
            const activePlayers = Array.from(game.players.values()).filter(p => p.investment > 0 && !p.withdrawn);
            const crashChance = dumpVotes > activePlayers.length / 2 ? 0.8 : Math.min(0.3, 0.05 * game.round);
            
            if (Math.random() < crashChance || game.round > 10 || activePlayers.length === 0) {
              game.crashed = true;
              const embed = {
                title: 'Market Meltdown',
                description: `💥 **MARKET CRASHED!**\n\n` +
                             `Game Over! Market crashed at ${game.multiplier.toFixed(2)}x multiplier!\n` +
                             `Players who didn't withdraw lost their investment.`,
                color: 0xff0000,
                thumbnail: {
                  url: 'https://i.imgur.com/oqSl593.png'
                }
              };
              try {
                await interaction.channel.send({ embeds: [embed] });
              } catch (error) {
                console.error('Error ending Market Meltdown:', error);
              }
              activeGames.delete(gameId);
              return;
            }

            game.round++;
          }

          // Game ended with all players withdrawn
          const finalGame = activeGames.get(gameId);
          if (finalGame && !finalGame.crashed) {
            const embed = {
              title: 'Market Meltdown',
              description: `🎉 **GAME COMPLETED!**\n\n` +
                           `All players successfully withdrew their investments!`,
              color: 0x00ff00,
              thumbnail: {
                url: 'https://i.imgur.com/oqSl593.png'
              }
            };
            try {
              await interaction.channel.send({ embeds: [embed] });
            } catch (error) {
              console.error('Error ending Market Meltdown:', error);
            }
            activeGames.delete(gameId);
          }
        }, 30000); // 30s investment phase
      }, 30000); // 30s registration phase
    }
  } catch (error) {
    console.error('Error executing command:', error);
    if (interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred while executing the command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'An error occurred while executing the command!', ephemeral: true });
    }
  }
}

// Handle button interactions
async function handleButton(interaction) {
  try {
    const [gameType, action, gameId] = interaction.customId.split('_');
    if (gameType === 'meltdown') {
      await handleMeltdownButton(interaction, action, gameId);
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({ content: 'An error occurred while processing the button!', ephemeral: true });
  }
}

module.exports = {
  name: 'games',
  commands,
  execute,
  handleButton,
  activeGames, // Exported for compatibility with original code
}; 