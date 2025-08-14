const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const leveling = require('./leveling');

module.exports = {
  name: 'giftmint',
  commands: [
    new SlashCommandBuilder()
      .setName('giftmint')
      .setDescription('Gift $MINT to a user (Admin only)')
      .addUserOption(option => option.setName('user').setDescription('User to gift tokens to').setRequired(true))
      .addIntegerOption(option => option.setName('amount').setDescription('Amount of $MINT (1-1000)').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .setDMPermission(false)
  ],
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > parseInt(process.env.MAX_GIFT_TOKENS)) {
      return interaction.reply({
        content: `Amount must be between 1 and ${process.env.MAX_GIFT_TOKENS} $MINT.`,
        ephemeral: true
      });
    }

    if (!(await leveling.addTokens(target, amount))) {
      return interaction.reply({ content: 'Error gifting tokens!', ephemeral: true });
    }

    const data = await leveling.loadData();
    data[target.id].logs = data[target.id].logs || { shop: [], gifts: [], xp: [] };
    data[target.id].logs.gifts.push({
      mod_id: interaction.user.id,
      user_id: target.id,
      amount,
      timestamp: new Date().toISOString()
    });
    await leveling.saveData(data);

    const { logGift } = require('./logging');
    await logGift(interaction.client, interaction.user.id, target.id, leveling.formatTokens(amount));

    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle('Mint Tokens Gifted!')
        .setDescription(`You received ${leveling.formatTokens(amount)} from <@${interaction.user.id}>!`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')]
    }).catch(() => {});

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('Gift Successful')
        .setDescription(`Gifted ${leveling.formatTokens(amount)} to <@${target.id}>!`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')],
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
};