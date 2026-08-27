import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const MAX_PLAYERS = 10;
const STARTING_HP = 100;

export default {
  data: new SlashCommandBuilder()
    .setName('fight')
    .setDescription('Creates a multiplayer battle lobby.'),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const host = interaction.user;

    // Store all players in the battle
    const players = new Map();

    players.set(host.id, {
      user: host,
      hp: STARTING_HP,
      alive: true,
    });

    const createLobbyEmbed = () => {
      const playerList = [...players.values()]
        .map((player, index) => {
          return `${index + 1}. **${player.user.username}**`;
        })
        .join('\n');

      return successEmbed(
        '⚔️ Multiplayer Battle Lobby',
        `**${host.username}** has created a battle!\n\n` +
          `👥 **Players (${players.size}/${MAX_PLAYERS}):**\n` +
          `${playerList}\n\n` +
          `Click **Join Battle** to enter.\n` +
          `The host can start once at least 2 players have joined.`
      );
    };

    const createButtons = (battleStarted = false) => {
      if (battleStarted) return [];

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('fight_join')
          .setLabel('Join Battle')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('fight_start')
          .setLabel('Start Battle')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('fight_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      );

      return [row];
    };

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [createLobbyEmbed()],
      components: createButtons(),
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      time: 120000,
    });

    collector.on('collect', async (buttonInteraction) => {
      try {
        // JOIN BATTLE
        if (buttonInteraction.customId === 'fight_join') {
          if (players.has(buttonInteraction.user.id)) {
            return buttonInteraction.reply({
              content: '⚠️ You are already in this battle!',
              ephemeral: true,
            });
          }

          if (buttonInteraction.user.bot) {
            return buttonInteraction.reply({
              content: '⚠️ Bots cannot join the battle!',
              ephemeral: true,
            });
          }

          if (players.size >= MAX_PLAYERS) {
            return buttonInteraction.reply({
              content: `⚠️ The battle is full! Maximum: ${MAX_PLAYERS} players.`,
              ephemeral: true,
            });
          }

          players.set(buttonInteraction.user.id, {
            user: buttonInteraction.user,
            hp: STARTING_HP,
            alive: true,
          });

          await buttonInteraction.update({
            embeds: [createLobbyEmbed()],
            components: createButtons(),
          });

          return;
        }

        // CANCEL BATTLE
        if (buttonInteraction.customId === 'fight_cancel') {
          if (buttonInteraction.user.id !== host.id) {
            return buttonInteraction.reply({
              content: '⚠️ Only the battle host can cancel this battle!',
              ephemeral: true,
            });
          }

          collector.stop('cancelled');

          return buttonInteraction.update({
            embeds: [
              warningEmbed(
                '⚔️ Battle Cancelled',
                `**${host.username}** cancelled the battle.`
              ),
            ],
            components: [],
          });
        }

        // START BATTLE
        if (buttonInteraction.customId === 'fight_start') {
          if (buttonInteraction.user.id !== host.id) {
            return buttonInteraction.reply({
              content: '⚠️ Only the battle host can start the battle!',
              ephemeral: true,
            });
          }

          if (players.size < 2) {
            return buttonInteraction.reply({
              content:
                '⚠️ At least 2 players are required to start the battle!',
              ephemeral: true,
            });
          }

          collector.stop('started');

          await buttonInteraction.update({
            embeds: [
              successEmbed(
                '⚔️ Battle Started!',
                `🔥 **${players.size} warriors have entered the arena!**\n\n` +
                  [...players.values()]
                    .map(
                      (player) =>
                        `❤️ **${player.user.username}** — ${player.hp} HP`
                    )
                    .join('\n')
              ),
            ],
            components: [],
          });

          // Start the actual battle
          await runBattle(interaction, players);

          return;
        }
      } catch (error) {
        logger.error('Error handling fight button:', error);

        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: '⚠️ Something went wrong during the battle.',
            ephemeral: true,
          });
        }
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        try {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              warningEmbed(
                '⚔️ Battle Expired',
                'Nobody started the battle in time.'
              ),
            ],
            components: [],
          });
        } catch (error) {
          logger.error('Error closing fight lobby:', error);
        }
      }
    });

    logger.debug(
      `Fight lobby created by ${host.id} in guild ${interaction.guildId}`
    );
  },
};


// ===============================
// MULTIPLAYER BATTLE ENGINE
// ===============================

async function runBattle(interaction, players) {
  const battleLog = [];

  const actions = [
    'throws a wild punch at',
    'casts a spell on',
    'lands a critical hit on',
    'launches a powerful attack at',
    'parries and counterattacks',
    'strikes',
  ];

  // Continue until only one player remains
  while ([...players.values()].filter((player) => player.alive).length > 1) {
    const alivePlayers = [...players.values()].filter(
      (player) => player.alive
    );

    // Choose random attacker
    const attacker =
      alivePlayers[rand(0, alivePlayers.length - 1)];

    // Choose random target that is NOT the attacker
    const possibleTargets = alivePlayers.filter(
      (player) => player.user.id !== attacker.user.id
    );

    const target =
      possibleTargets[rand(0, possibleTargets.length - 1)];

    const damage = rand(10, 30);

    const action = actions[rand(0, actions.length - 1)];

    target.hp -= damage;

    if (target.hp < 0) {
      target.hp = 0;
    }

    battleLog.push(
      `⚔️ **${attacker.user.username}** ${action} ` +
        `**${target.user.username}** for **${damage} damage!**\n` +
        `❤️ ${target.user.username}: **${target.hp} HP**`
    );

    // Check if player has been eliminated
    if (target.hp <= 0) {
      target.alive = false;

      battleLog.push(
        `💀 **${target.user.username} has been eliminated from the battle!**`
      );
    }
  }

  // Find winner
  const winner = [...players.values()].find(
    (player) => player.alive
  );

  const finalLog = battleLog.join('\n\n');

  const finalDescription =
    `${finalLog}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👑 **${winner.user.username} is the last warrior standing!**\n` +
    `🏆 **${winner.user.username} wins the battle!**`;

  // Discord embed limit protection
  const description =
    finalDescription.length <= 4096
      ? finalDescription
      : finalDescription.slice(0, 4000) +
        '\n\n⚔️ Battle log shortened...';

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [
      successEmbed(
        '🏆 Multiplayer Battle Complete!',
        description
      ),
    ],
    components: [],
  });

  logger.debug(
    `Multiplayer battle completed in guild ${interaction.guildId}. Winner: ${winner.user.id}`
  );
}
