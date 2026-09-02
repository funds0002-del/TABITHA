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
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default {
  data: new SlashCommandBuilder()
    .setName('fight')
    .setDescription('Start a solo or multiplayer battle.')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('Choose your battle mode.')
        .setRequired(true)
        .addChoices(
          {
            name: '🤖 Solo',
            value: 'solo',
          },
          {
            name: '⚔️ Multiplayer',
            value: 'multiplayer',
          }
        )
    ),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const mode = interaction.options.getString('mode');

    // ==========================================
    // SOLO MODE
    // ==========================================

    if (mode === 'solo') {
      await startSoloBattle(interaction);
      return;
    }

    // ==========================================
    // MULTIPLAYER MODE
    // ==========================================

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

        // ==========================================
        // JOIN BATTLE
        // ==========================================

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

        // ==========================================
        // CANCEL BATTLE
        // ==========================================

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

        // ==========================================
        // START MULTIPLAYER BATTLE
        // ==========================================

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

          // Start multiplayer battle
          await runBattle(interaction, players);

          return;
        }

      } catch (error) {
        logger.error('Error handling fight button:', error);

        if (
          !buttonInteraction.replied &&
          !buttonInteraction.deferred
        ) {
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


// =====================================================
// SOLO BATTLE
// =====================================================

async function startSoloBattle(interaction) {
  const player = interaction.user;

  let playerHP = STARTING_HP;
  let goblinHP = 100;
  let round = 1;

  // Store the complete battle history
  const battleHistory = [];

  const createSoloEmbed = (
    title = '🤖 Solo Battle',
    extraText = ''
  ) => {

    const playerStatus =
      playerHP > 0
        ? `❤️ **${player.username}** — ${playerHP}/100 HP`
        : `💀 **${player.username}** — Defeated`;

    const goblinStatus =
      goblinHP > 0
        ? `👹 **Goblin** — ${goblinHP}/100 HP`
        : `💀 **Goblin** — Defeated`;

    return successEmbed(
      title,
      `${extraText}\n\n` +
        `📜 **Battle History**\n\n` +
        `${battleHistory.join('\n\n')}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Current Health**\n` +
        `${playerStatus}\n` +
        `${goblinStatus}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🎯 **Round:** ${round}`
    );
  };

  // ==========================================
  // BATTLE START
  // ==========================================

  battleHistory.push(
    `🔥 **Battle Started!**\n` +
    `👤 **${player.username}** vs 👹 **Goblin**`
  );

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [
      createSoloEmbed(
        '🤖 Solo Battle',
        `**${player.username}** has entered the arena!\n\n` +
          `🤖 The battle will be fought automatically...`
      ),
    ],
    components: [],
  });

  await sleep(1500);

  // ==========================================
  // AUTOMATIC BATTLE LOOP
  // ==========================================

  while (playerHP > 0 && goblinHP > 0) {

    // ==========================================
    // PLAYER ATTACKS
    // ==========================================

    const playerDamage = rand(10, 30);

    goblinHP -= playerDamage;

    if (goblinHP < 0) {
      goblinHP = 0;
    }

    const playerAttackText =
      `⚔️ **${player.username} attacks the Goblin!**\n` +
      `💥 **${player.username} deals ${playerDamage} damage!**\n` +
      `👹 **Goblin HP:** ${goblinHP}/100`;

    // ==========================================
    // GOBLIN DEFEATED
    // ==========================================

    if (goblinHP <= 0) {

      battleHistory.push(
        `⚔️ **Round ${round}**\n\n` +
        `${playerAttackText}\n\n` +
        `💀 **The Goblin has been defeated!**\n` +
        `🏆 **${player.username} wins!**`
      );

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createSoloEmbed(
            '🏆 Victory!',
            `🏆 **${player.username} has won the battle!**`
          ),
        ],
        components: [],
      });

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: ${player.id}`
      );

      return;
    }

    // ==========================================
    // GOBLIN ATTACKS
    // ==========================================

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createSoloEmbed(
          '⚔️ Solo Battle',
          `⚔️ **Round ${round} is underway...**`
        ),
      ],
      components: [],
    });

    await sleep(1500);

    const goblinDamage = rand(8, 25);

    playerHP -= goblinDamage;

    if (playerHP < 0) {
      playerHP = 0;
    }

    const goblinAttackText =
      `👹 **The Goblin attacks ${player.username}!**\n` +
      `💥 **The Goblin deals ${goblinDamage} damage!**\n` +
      `❤️ **${player.username} HP:** ${playerHP}/100`;

    // ==========================================
    // ADD COMPLETE ROUND TO HISTORY
    // ==========================================

    battleHistory.push(
      `⚔️ **Round ${round}**\n\n` +
      `${playerAttackText}\n\n` +
      `${goblinAttackText}`
    );

    // ==========================================
    // PLAYER DEFEATED
    // ==========================================

    if (playerHP <= 0) {

      battleHistory.push(
        `💀 **${player.username} has been defeated!**\n` +
        `🏆 **The Goblin wins!**`
      );

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createSoloEmbed(
            '💀 Defeat',
            `💀 **${player.username} has been defeated!**\n\n` +
              `👹 **The Goblin wins!**`
          ),
        ],
        components: [],
      });

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: Goblin`
      );

      return;
    }

    // ==========================================
    // SHOW UPDATED BATTLE HISTORY
    // ==========================================

    round++;

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createSoloEmbed(
          '🤖 Solo Battle',
          `⚔️ **Round ${round - 1} complete!**`
        ),
      ],
      components: [],
    });

    await sleep(1500);
  }
}


// =====================================================
// MULTIPLAYER BATTLE ENGINE
// =====================================================

async function runBattle(interaction, players) {

  const battleLog = [];
  let round = 1;

  const actions = [
    'throws a wild punch at',
    'casts a spell on',
    'lands a critical hit on',
    'launches a powerful attack at',
    'parries and counterattacks against',
    'strikes',
  ];

  // Keep fighting until only one player is alive
  while (
    [...players.values()].filter(player => player.alive).length > 1
  ) {

    const alivePlayers = [...players.values()].filter(
      player => player.alive
    );

    // Pick attacker
    const attacker =
      alivePlayers[rand(0, alivePlayers.length - 1)];

    // Pick someone else as target
    const possibleTargets = alivePlayers.filter(
      player => player.user.id !== attacker.user.id
    );

    const target =
      possibleTargets[rand(0, possibleTargets.length - 1)];

    const damage = rand(10, 30);

    const action =
      actions[rand(0, actions.length - 1)];

    // Apply damage
    target.hp -= damage;

    if (target.hp < 0) {
      target.hp = 0;
    }

    // Create round message
    const roundText =
      `⚔️ **Round ${round}**\n` +
      `**${attacker.user.username}** ${action} ` +
      `**${target.user.username}** for **${damage} damage!**\n\n` +
      `❤️ **${target.user.username}: ${target.hp} HP**`;

    battleLog.push(roundText);

    // Check elimination
    if (target.hp <= 0) {

      target.alive = false;

      battleLog.push(
        `💀 **${target.user.username} has been eliminated!**`
      );
    }

    // Show recent battle activity
    const recentLog = battleLog.slice(-6).join('\n\n');

    // Show current player health
    const healthStatus = [...players.values()]
      .map(player => {

        if (!player.alive) {
          return `💀 **${player.user.username}** — Eliminated`;
        }

        return `❤️ **${player.user.username}** — ${player.hp} HP`;
      })
      .join('\n');

    const description =
      `${recentLog}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📊 **Current Health**\n${healthStatus}`;

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        successEmbed(
          '⚔️ Multiplayer Battle!',
          description
        ),
      ],
      components: [],
    });

    // Wait 2 seconds before next round
    await sleep(2000);

    round++;
  }

  // Find winner
  const winner = [...players.values()].find(
    player => player.alive
  );

  const finalHealth = [...players.values()]
    .map(player => {

      if (!player.alive) {
        return `💀 **${player.user.username}** — Eliminated`;
      }

      return `👑 **${player.user.username}** — ${player.hp} HP`;
    })
    .join('\n');

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [
      successEmbed(
        '🏆 Multiplayer Battle Complete!',
        `👑 **${winner.user.username} is the last warrior standing!**\n\n` +
        `🏆 **${winner.user.username} wins the battle!**\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Final Results**\n${finalHealth}`
      ),
    ],
    components: [],
  });

  logger.debug(
    `Multiplayer battle completed in guild ${interaction.guildId}. Winner: ${winner.user.id}`
  );
}
