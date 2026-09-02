// =====================================================
// SOLO BATTLE
// =====================================================

async function startSoloBattle(interaction) {
  const player = interaction.user;

  let playerHP = STARTING_HP;
  let goblinHP = 100;
  let round = 1;

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
        `👤 **Player**\n${playerStatus}\n\n` +
        `⚔️ **VS**\n\n` +
        `👹 **Enemy**\n${goblinStatus}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🎯 **Round:** ${round}`
    );
  };

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
    // =================================================
    // PLAYER ATTACKS
    // =================================================

    const playerDamage = rand(10, 30);
    goblinHP -= playerDamage;

    if (goblinHP < 0) {
      goblinHP = 0;
    }

    const playerText =
      `⚔️ **${player.username} attacks the Goblin!**\n` +
      `💥 **${player.username} deals ${playerDamage} damage!**`;

    // Goblin defeated
    if (goblinHP <= 0) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createSoloEmbed(
            '🏆 Victory!',
            `${playerText}\n\n` +
              `💀 **The Goblin has been defeated!**\n\n` +
              `🏆 **${player.username} wins!**`
          ),
        ],
        components: [],
      });

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: ${player.id}`
      );

      return;
    }

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createSoloEmbed(
          '⚔️ Solo Battle',
          `${playerText}\n\n` +
            `👹 **Goblin:** ${goblinHP}/100 HP`
        ),
      ],
      components: [],
    });

    await sleep(1500);

    // =================================================
    // GOBLIN ATTACKS
    // =================================================

    const goblinDamage = rand(8, 25);
    playerHP -= goblinDamage;

    if (playerHP < 0) {
      playerHP = 0;
    }

    const goblinText =
      `👹 **The Goblin attacks ${player.username}!**\n` +
      `💥 **The Goblin deals ${goblinDamage} damage!**`;

    // Player defeated
    if (playerHP <= 0) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createSoloEmbed(
            '💀 Defeat',
            `${playerText}\n\n` +
              `${goblinText}\n\n` +
              `💀 **${player.username} has been defeated!**`
          ),
        ],
        components: [],
      });

      logger.debug(
        `Solo fight completed in guild ${interaction.guildId}. Winner: Goblin`
      );

      return;
    }

    // Next round
    round++;

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createSoloEmbed(
          '🤖 Solo Battle',
          `${playerText}\n\n${goblinText}`
        ),
      ],
      components: [],
    });

    await sleep(1500);
  }
}
