import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';

import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const MAX_PLAYERS = 10;
const STARTING_HP = 100;

// Beta Testers role
const BETA_TESTER_ROLE_ID = '1545106467928154173';

const SHOW_TAVERN_IMAGE = false;

// Tabitha's Tavern image
const TAVERN_IMAGE_URL =
  'https://raw.githubusercontent.com/funds0002-del/TABITHA/main/asset/Tabithas_Tavern_PNG.png';

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export default {
  data: new SlashCommandBuilder()
    .setName('fight')
    .setDescription("Enter Tabitha’s Tavern and start a battle."),

  category: 'Fun',

  async execute(interaction, config, client) {
    // ==========================================
    // FIGHT PERMISSION CHECK
    // ==========================================

    const isAdmin = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator
    );

    const isBetaTester = interaction.member.roles.cache.has(
      BETA_TESTER_ROLE_ID
    );

    if (!isAdmin && !isBetaTester) {
      return interaction.reply({
        content:
          '❌ **Access Denied**\n' +
          'Only **Beta Testers** and **server administrators** can use the `/fight` command.',
        ephemeral: true,
      });
    }

    await InteractionHelper.safeDefer(interaction);

    // ==========================================
    // TABITHA'S TAVERN OPENING SCREEN
    // ==========================================

    const tavernEmbed = successEmbed(
      '🏰 Tabitha’s Tavern',
      `Welcome to **Tabitha’s Tavern**, warrior!\n\n` +
        `⚔️ The arena awaits.\n` +
        `Choose how you want to enter the battle below.`
    ).setImage(TAVERN_IMAGE_URL);

    const modeButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fight_mode_solo')
        .setLabel('Solo')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('fight_mode_multiplayer')
        .setLabel('Multiplayer')
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Success)
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [tavernEmbed],
      components: [modeButtons],
    });

    const message = await interaction.fetchReply();

    // ==========================================
    // MODE SELECTION COLLECTOR
    // ==========================================

    const modeCollector = message.createMessageComponentCollector({
      time: 120000,
    });

    modeCollector.on('collect', async (buttonInteraction) => {
      try {
        // ======================================
        // SOLO MODE
        // ======================================

        if (buttonInteraction.customId === 'fight_mode_solo') {
          modeCollector.stop('solo');

          await buttonInteraction.update({
            embeds: [
              successEmbed(
                '🤖 Solo Battle',
                `⚔️ **Preparing the arena...**\n\n` +
                  `**${buttonInteraction.user.username}** is entering battle against the Goblin!`
              ),
            ],
            components: [],
          });

          await sleep(1000);

          await startSoloBattle(interaction);

          return;
        }

        // ======================================
        // MULTIPLAYER MODE
        // ======================================

        if (
          buttonInteraction.customId ===
          'fight_mode_multiplayer'
        ) {
          modeCollector.stop('multiplayer');

          const host = buttonInteraction.user;

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

          const createLobbyButtons = () => {
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

          await buttonInteraction.update({
            embeds: [createLobbyEmbed()],
            components: createLobbyButtons(),
          });

          const lobbyMessage = await interaction.fetchReply();

          const collector =
            lobbyMessage.createMessageComponentCollector({
              time: 120000,
            });

          collector.on(
            'collect',
            async (lobbyInteraction) => {
              try {
                // ======================================
                // JOIN BATTLE
                // ======================================

                if (
                  lobbyInteraction.customId ===
                  'fight_join'
                ) {
                  if (
                    players.has(
                      lobbyInteraction.user.id
                    )
                  ) {
                    return lobbyInteraction.reply({
                      content:
                        '⚠️ You are already in this battle!',
                      ephemeral: true,
                    });
                  }

                  if (lobbyInteraction.user.bot) {
                    return lobbyInteraction.reply({
                      content:
                        '⚠️ Bots cannot join the battle!',
                      ephemeral: true,
                    });
                  }

                  if (players.size >= MAX_PLAYERS) {
                    return lobbyInteraction.reply({
                      content:
                        `⚠️ The battle is full! Maximum: ${MAX_PLAYERS} players.`,
                      ephemeral: true,
                    });
                  }

                  players.set(
                    lobbyInteraction.user.id,
                    {
                      user: lobbyInteraction.user,
                      hp: STARTING_HP,
                      alive: true,
                    }
                  );

                  await lobbyInteraction.update({
                    embeds: [createLobbyEmbed()],
                    components:
                      createLobbyButtons(),
                  });

                  return;
                }

                // ======================================
                // CANCEL BATTLE
                // ======================================

                if (
                  lobbyInteraction.customId ===
                  'fight_cancel'
                ) {
                  if (
                    lobbyInteraction.user.id !==
                    host.id
                  ) {
                    return lobbyInteraction.reply({
                      content:
                        '⚠️ Only the battle host can cancel this battle!',
                      ephemeral: true,
                    });
                  }

                  collector.stop('cancelled');

                  return lobbyInteraction.update({
                    embeds: [
                      warningEmbed(
                        '⚔️ Battle Cancelled',
                        `**${host.username}** cancelled the battle.`
                      ),
                    ],
                    components: [],
                  });
                }

                // ======================================
                // START BATTLE
                // ======================================

                if (
                  lobbyInteraction.customId ===
                  'fight_start'
                ) {
                  if (
                    lobbyInteraction.user.id !==
                    host.id
                  ) {
                    return lobbyInteraction.reply({
                      content:
                        '⚠️ Only the battle host can start the battle!',
                      ephemeral: true,
                    });
                  }

                  if (players.size < 2) {
                    return lobbyInteraction.reply({
                      content:
                        '⚠️ At least 2 players are required to start the battle!',
                      ephemeral: true,
                    });
                  }

                  collector.stop('started');

                  await lobbyInteraction.update({
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

                  await runBattle(
                    interaction,
                    players
                  );

                  return;
                }
              } catch (error) {
                logger.error(
                  'Error handling multiplayer fight button:',
                  error
                );

                if (
                  !lobbyInteraction.replied &&
                  !lobbyInteraction.deferred
                ) {
                  await lobbyInteraction.reply({
                    content:
                      '⚠️ Something went wrong during the battle.',
                    ephemeral: true,
                  });
                }
              }
            }
          );

          collector.on(
            'end',
            async (collected, reason) => {
              if (reason === 'time') {
                try {
                  await InteractionHelper.safeEditReply(
                    interaction,
                    {
                      embeds: [
                        warningEmbed(
                          '⚔️ Battle Expired',
                          'Nobody started the battle in time.'
                        ),
                      ],
                      components: [],
                    }
                  );
                } catch (error) {
                  logger.error(
                    'Error closing fight lobby:',
                    error
                  );
                }
              }
            }
          );

          logger.debug(
            `Multiplayer fight lobby created by ${host.id} in guild ${interaction.guildId}`
          );

          return;
        }
      } catch (error) {
        logger.error(
          'Error handling fight mode button:',
          error
        );

        if (
          !buttonInteraction.replied &&
          !buttonInteraction.deferred
        ) {
          await buttonInteraction.reply({
            content:
              '⚠️ Something went wrong during the battle.',
            ephemeral: true,
          });
        }
      }
    });

    modeCollector.on(
      'end',
      async (collected, reason) => {
        if (reason === 'time') {
          try {
            await InteractionHelper.safeEditReply(
              interaction,
              {
                embeds: [
                  warningEmbed(
                    '🏰 Tabitha’s Tavern',
                    'The battle selection has expired. Use `/fight` again when you are ready.'
                  ),
                ],
                components: [],
              }
            );
          } catch (error) {
            logger.error(
              'Error closing fight mode selection:',
              error
            );
          }
        }
      }
    );

    logger.debug(
      `Fight menu created by ${interaction.user.id} in guild ${interaction.guildId}`
    );
  },
};

// ==========================================
// SOLO BATTLE
// ==========================================

async function startSoloBattle(interaction) {
  const player = interaction.user;

  let playerHP = STARTING_HP;
  let goblinHP = 100;
  let round = 1;

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

  while (playerHP > 0 && goblinHP > 0) {
    // ========================================
    // PLAYER ATTACK
    // ========================================

    const playerDamage = rand(10, 30);

    goblinHP -= playerDamage;

    if (goblinHP < 0) {
      goblinHP = 0;
    }

    const playerAttackText =
      `⚔️ **${player.username} attacks the Goblin!**\n` +
      `💥 **${player.username} deals ${playerDamage} damage!**\n` +
      `👹 **Goblin HP:** ${goblinHP}/100`;

    // ========================================
    // PLAYER WINS
    // ========================================

    if (goblinHP <= 0) {
      battleHistory.push(
        `⚔️ **Round ${round}**\n\n` +
          `${playerAttackText}\n\n` +
          `💀 **The Goblin has been defeated!**\n` +
          `🏆 **${player.username} wins!**`
      );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            createSoloEmbed(
              '🏆 Victory!',
              `🏆 **${player.username} has won the battle!**`
            ),
          ],
          components: [],
        }
      );

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: ${player.id}`
      );

      return;
    }

    await InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          createSoloEmbed(
            '⚔️ Solo Battle',
            `⚔️ **Round ${round} is underway...**`
          ),
        ],
        components: [],
      }
    );

    await sleep(1500);

    // ========================================
    // GOBLIN ATTACK
    // ========================================

    const goblinDamage = rand(8, 25);

    playerHP -= goblinDamage;

    if (playerHP < 0) {
      playerHP = 0;
    }

    const goblinAttackText =
      `👹 **The Goblin attacks ${player.username}!**\n` +
      `💥 **The Goblin deals ${goblinDamage} damage!**\n` +
      `❤️ **${player.username} HP:** ${playerHP}/100`;

    battleHistory.push(
      `⚔️ **Round ${round}**\n\n` +
        `${playerAttackText}\n\n` +
        `${goblinAttackText}`
    );

    // ========================================
    // PLAYER DEFEATED
    // ========================================

    if (playerHP <= 0) {
      battleHistory.push(
        `💀 **${player.username} has been defeated!**\n` +
          `🏆 **The Goblin wins!**`
      );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            createSoloEmbed(
              '💀 Defeat',
              `💀 **${player.username} has been defeated!**\n\n` +
                `👹 **The Goblin wins!**`
            ),
          ],
          components: [],
        }
      );

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: Goblin`
      );

      return;
    }

    round++;

    await InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          createSoloEmbed(
            '🤖 Solo Battle',
            `⚔️ **Round ${round - 1} complete!**`
          ),
        ],
        components: [],
      }
    );

    await sleep(1500);
  }
}

// ==========================================
// MULTIPLAYER BATTLE ENGINE
// ==========================================

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

  while (
    [...players.values()].filter(
      (player) => player.alive
    ).length > 1
  ) {
    const alivePlayers = [
      ...players.values(),
    ].filter((player) => player.alive);

    const attacker =
      alivePlayers[
        rand(0, alivePlayers.length - 1)
      ];

    const possibleTargets = alivePlayers.filter(
      (player) =>
        player.user.id !== attacker.user.id
    );

    const target =
      possibleTargets[
        rand(0, possibleTargets.length - 1)
      ];

    const damage = rand(10, 30);

    const action =
      actions[rand(0, actions.length - 1)];

    target.hp -= damage;

    if (target.hp < 0) {
      target.hp = 0;
    }

    const roundText =
      `⚔️ **Round ${round}**\n` +
      `**${attacker.user.username}** ${action} ` +
      `**${target.user.username}** for **${damage} damage!**\n\n` +
      `❤️ **${target.user.username}: ${target.hp} HP**`;

    battleLog.push(roundText);

    if (target.hp <= 0) {
      target.alive = false;

      battleLog.push(
        `💀 **${target.user.username} has been eliminated!**`
      );
    }

    const recentLog = battleLog
      .slice(-6)
      .join('\n\n');

    const healthStatus = [
      ...players.values(),
    ]
      .map((player) => {
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

    await InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          successEmbed(
            '⚔️ Multiplayer Battle!',
            description
          ),
        ],
        components: [],
      }
    );

    await sleep(2000);

    round++;
  }

  // ==========================================
  // FIND WINNER
  // ==========================================

  const winner = [
    ...players.values(),
  ].find((player) => player.alive);

  if (!winner) {
    logger.error(
      `Multiplayer battle ended without a winner in guild ${interaction.guildId}`
    );

    await InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          warningEmbed(
            '⚠️ Battle Error',
            'The battle ended unexpectedly without a winner.'
          ),
        ],
        components: [],
      }
    );

    return;
  }

  // ==========================================
  // FINAL RESULTS
  // ==========================================

  const finalHealth = [
    ...players.values(),
  ]
    .map((player) => {
      if (!player.alive) {
        return `💀 **${player.user.username}** — Eliminated`;
      }

      return `👑 **${player.user.username}** — ${player.hp} HP`;
    })
    .join('\n');

  await InteractionHelper.safeEditReply(
    interaction,
    {
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
    }
  );

  logger.debug(
    `Multiplayer battle completed in guild ${interaction.guildId}. Winner: ${winner.user.id}`
  );
}
