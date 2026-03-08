// src/index.js - Main Bot File

require('dotenv').config();

const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============ CONFIGURATION & DATABASE ============

// Simple JSON database for server settings
const DB_PATH = path.join(__dirname, '..', 'database.json');

// Load or create database
function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading database:', error);
  }
  return {};
}

// Save database
function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Get server settings
function getServerSettings(guildId) {
  const db = loadDatabase();
  if (!db[guildId]) {
    db[guildId] = {
      welcomeChannel: null,
      leaveChannel: null,
      welcomeMessage: null,
      leaveMessage: null,
      welcomeDM: null,
      leaveDM: null,
      autoRole: null,
      enabled: {
        welcome: false,
        leave: false,
        welcomeDM: false,
        leaveDM: false,
        autoRole: false
      }
    };
    saveDatabase(db);
  }
  return db[guildId];
}

// Update server settings
function updateServerSettings(guildId, settings) {
  const db = loadDatabase();
  db[guildId] = { ...db[guildId], ...settings };
  saveDatabase(db);
}

// ============ VARIABLE REPLACER ============

/**
 * ជំនួសអថេរនានាក្នុងសារ
 * Replace variables in messages
 */
function replaceVariables(text, member, guild) {
  if (!text) return text;
  
  const memberCount = guild.memberCount;
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return text
    // User variables
    .replace(/{user}/g, member.user.toString())
    .replace(/{user\.username}/g, member.user.username)
    .replace(/{user\.id}/g, member.user.id)
    .replace(/{user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }))
    .replace(/{user\.mention}/g, member.user.toString())
    // Server variables
    .replace(/{server\.name}/g, guild.name)
    .replace(/{server\.id}/g, guild.id)
    .replace(/{server\.icon}/g, guild.iconURL({ dynamic: true }) || '')
    // Member count
    .replace(/{membercount}/g, memberCount.toString())
    .replace(/{membercount\.ordinal}/g, ordinal(memberCount))
    // Channel mention (format: {#channelname})
    .replace(/\{#([^}]+)\}/g, (match, channelName) => {
      const channel = guild.channels.cache.find(c => c.name === channelName || c.id === channelName);
      return channel ? channel.toString() : match;
    })
    // Role mention (format: {@rolename})
    .replace(/\{@([^}]+)\}/g, (match, roleName) => {
      const role = guild.roles.cache.find(r => r.name === roleName || r.id === roleName);
      return role ? role.toString() : match;
    })
    // Emoji (format: {:emojiname})
    .replace(/\{:([^}]+)\}/g, (match, emojiName) => {
      const emoji = guild.emojis.cache.find(e => e.name === emojiName);
      return emoji ? emoji.toString() : match;
    });
}

// ============ BOT CLIENT ============

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ============ SLASH COMMANDS DEFINITION ============

const commands = [
  // /autorole - គ្រប់គ្រងតួនាទីស្វ័យប្រវត្តិ
  new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('គ្រប់គ្រងតួនាទីស្វ័យប្រវត្តិ (Manage auto role)')
    .addSubcommand(sub => 
      sub.setName('set')
        .setDescription('កំណត់តួនាទីស្វ័យប្រវត្តិ (Set auto role)')
        .addRoleOption(opt => 
          opt.setName('role')
            .setDescription('ជ្រើសរើសតួនាទី (Select role)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub => 
      sub.setName('remove')
        .setDescription('លុបតួនាទីស្វ័យប្រវត្តិ (Remove auto role)')
    )
    .addSubcommand(sub => 
      sub.setName('view')
        .setDescription('មើលតួនាទីស្វ័យប្រវត្តិបច្ចុប្បន្ន (View current auto role)')
    ),
  
  // /help - បង្ហាញវិធីប្រើប្រាស់បូត
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('បង្ហាញព័ត៌មានអំពីការប្រើប្រាស់បូត (Show bot usage)'),
  
  // /info - បង្ហាញព័ត៌មានការកំណត់បច្ចុប្បន្ន
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('បង្ហាញព័ត៌មានការកំណត់បច្ចុប្បន្ន (Show current settings)'),
  
  // /setup - ដំណើរការកំណត់ប្រព័ន្ធស្វាគមន៍ ចាកចេញ និងតួនាទីស្វ័យប្រវត្តិ
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('ដំណើរការកំណត់ប្រព័ន្ធ (Setup system)')
    .addSubcommand(sub => 
      sub.setName('welcome')
        .setDescription('កំណត់ឆានែលស្វាគមន៍ (Set welcome channel)')
        .addChannelOption(opt => 
          opt.setName('channel')
            .setDescription('ឆានែលស្វាគមន៍ (Welcome channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt => 
          opt.setName('message')
            .setDescription('សារស្វាគមន៍ (Welcome message)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub => 
      sub.setName('leave')
        .setDescription('កំណត់ឆានែលចាកចេញ (Set leave channel)')
        .addChannelOption(opt => 
          opt.setName('channel')
            .setDescription('ឆានែលចាកចេញ (Leave channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt => 
          opt.setName('message')
            .setDescription('សារចាកចេញ (Leave message)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub => 
      sub.setName('welcomedm')
        .setDescription('កំណត់សារ DM ស្វាគមន៍ (Set welcome DM)')
        .addStringOption(opt => 
          opt.setName('message')
            .setDescription('សារ DM ស្វាគមន៍ (Welcome DM message)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub => 
      sub.setName('leavedm')
        .setDescription('កំណត់សារ DM ចាកចេញ (Set leave DM)')
        .addStringOption(opt => 
          opt.setName('message')
            .setDescription('សារ DM ចាកចេញ (Leave DM message)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub => 
      sub.setName('view')
        .setDescription('មើលការកំណត់បច្ចុប្បន្ន (View current settings)')
    )
    .addSubcommand(sub => 
      sub.setName('toggle')
        .setDescription('បើក/បិទប្រព័ន្ធ (Toggle systems)')
        .addStringOption(opt => 
          opt.setName('system')
            .setDescription('ប្រព័ន្ធត្រូវបើក/បិទ (System to toggle)')
            .setRequired(true)
            .addChoices(
              { name: 'ស្វាគមន៍ (Welcome)', value: 'welcome' },
              { name: 'ចាកចេញ (Leave)', value: 'leave' },
              { name: 'DM ស្វាគមន៍ (Welcome DM)', value: 'welcomeDM' },
              { name: 'DM ចាកចេញ (Leave DM)', value: 'leaveDM' },
              { name: 'តួនាទីស្វ័យប្រវត្តិ (Auto Role)', value: 'autoRole' }
            )
        )
    )
];

// ============ EVENT HANDLERS ============

// Bot ready event
client.once('ready', async () => {
  console.log(`✅ បូតត្រូវបានចូលដំណើរការ: ${client.user.tag}`);
  console.log(`📊 ភ្ជាប់ទៅ ${client.guilds.cache.size} ម៉ាស៊ីនបម្រើ`);
  
  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try {
    console.log('🔄 កំពុងចុះឈ្មោះ commands...');
    
    // Global commands (takes up to 1 hour to update)
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log('✅ ចុះឈ្មោះ commands បានជោគជ័យ!');
  } catch (error) {
    console.error('❌ មានបញ្ហាក្នុងការចុះឈ្មោះ commands:', error);
  }
});

// Member join event - សមាជិកចូល
client.on('guildMemberAdd', async (member) => {
  const settings = getServerSettings(member.guild.id);
  
  // Auto Role - តួនាទីស្វ័យប្រវត្តិ
  if (settings.enabled.autoRole && settings.autoRole) {
    try {
      const role = member.guild.roles.cache.get(settings.autoRole);
      if (role) {
        await member.roles.add(role);
        console.log(`🎭 បានផ្តល់តួនាទី ${role.name} ដល់ ${member.user.tag}`);
      }
    } catch (error) {
      console.error('❌ មិនអាចផ្តល់តួនាទីបាន:', error);
    }
  }
  
  // Welcome Message - សារស្វាគមន៍
  if (settings.enabled.welcome && settings.welcomeChannel) {
    try {
      const channel = member.guild.channels.cache.get(settings.welcomeChannel);
      if (channel) {
        const message = settings.welcomeMessage || 
          'សូមស្វាគមន៍ {user} មកកាន់ {server.name}! 🎉';
        const formattedMessage = replaceVariables(message, member, member.guild);
        
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('👋 សូមស្វាគមន៍!')
          .setDescription(formattedMessage)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: `សមាជិកទី ${member.guild.memberCount}` })
          .setTimestamp();
        
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('❌ មិនអាចផ្ញើសារស្វាគមន៍បាន:', error);
    }
  }
  
  // Welcome DM - សារ DM ស្វាគមន៍
  if (settings.enabled.welcomeDM && settings.welcomeDM) {
    try {
      const message = replaceVariables(settings.welcomeDM, member, member.guild);
      await member.send(message);
    } catch (error) {
      console.error('❌ មិនអាចផ្ញើ DM បាន (អ្នកប្រើប្រហែលជាបិទ DM):', error);
    }
  }
});

// Member leave event - សមាជិកចាកចេញ
client.on('guildMemberRemove', async (member) => {
  const settings = getServerSettings(member.guild.id);
  
  // Leave Message - សារចាកចេញ
  if (settings.enabled.leave && settings.leaveChannel) {
    try {
      const channel = member.guild.channels.cache.get(settings.leaveChannel);
      if (channel) {
        const message = settings.leaveMessage || 
          'លាហើយ {user.username} យើងនឹងចង់ចាំអ្នក! 👋';
        const formattedMessage = replaceVariables(message, member, member.guild);
        
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('👋 លាហើយ!')
          .setDescription(formattedMessage)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: `សមាជិកនៅសល់: ${member.guild.memberCount}` })
          .setTimestamp();
        
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('❌ មិនអាចផ្ញើសារចាកចេញបាន:', error);
    }
  }
  
  // Leave DM - សារ DM ចាកចេញ
  if (settings.enabled.leaveDM && settings.leaveDM) {
    try {
      const message = replaceVariables(settings.leaveDM, member, member.guild);
      await member.send(message);
    } catch (error) {
      console.error('❌ មិនអាចផ្ញើ DM បាន:', error);
    }
  }
});

// Interaction handler for slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, options, guild, member } = interaction;
  
  // Check permissions
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({
      content: '❌ អ្នកត្រូវការសិទ្ធិ Administrator ដើម្បីប្រើប្រាស់ commands ទាំងនេះ!',
      ephemeral: true
    });
  }
  
  try {
    switch (commandName) {
      // ============ AUTOROLE COMMAND ============
      case 'autorole': {
        const subcommand = options.getSubcommand();
        const settings = getServerSettings(guild.id);
        
        if (subcommand === 'set') {
          const role = options.getRole('role');
          
          // Check bot permissions
          const botMember = guild.members.cache.get(client.user.id);
          if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.reply({
              content: '❌ បូតមិនមានសិទ្ធិ Manage Roles ទេ!',
              ephemeral: true
            });
          }
          
          // Check role hierarchy
          if (role.position >= botMember.roles.highest.position) {
            return interaction.reply({
              content: '❌ តួនាទីនេះខ្ពស់ជាងតួនាទីរបស់បូត!',
              ephemeral: true
            });
          }
          
          updateServerSettings(guild.id, {
            autoRole: role.id,
            enabled: { ...settings.enabled, autoRole: true }
          });
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ តួនាទីស្វ័យប្រវត្តិត្រូវបានកំណត់')
            .setDescription(`តួនាទីស្វ័យប្រវត្តិ: ${role.toString()}\nស្ថានភាព: 🟢 បើក`)
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
        
        else if (subcommand === 'remove') {
          updateServerSettings(guild.id, {
            autoRole: null,
            enabled: { ...settings.enabled, autoRole: false }
          });
          
          await interaction.reply({
            content: '✅ បានលុបតួនាទីស្វ័យប្រវត្តិដោយជោគជ័យ!',
            ephemeral: true
          });
        }
        
        else if (subcommand === 'view') {
          const currentRole = settings.autoRole ? 
            guild.roles.cache.get(settings.autoRole) : null;
          
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎭 តួនាទីស្វ័យប្រវត្តិ')
            .addFields(
              { 
                name: 'តួនាទី', 
                value: currentRole ? currentRole.toString() : 'មិនបានកំណត់',
                inline: true 
              },
              { 
                name: 'ស្ថានភាព', 
                value: settings.enabled.autoRole ? '🟢 បើក' : '🔔 បិទ',
                inline: true 
              }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
        break;
      }
      
      // ============ HELP COMMAND ============
      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📚 វិធីប្រើប្រាស់បូត SMOS GANG')
          .setDescription('បូតគ្រប់គ្រងស្វាគមន៍ ចាកចេញ និងតួនាទីស្វ័យប្រវត្តិ')
          .addFields(
            {
              name: '/autorole',
              value: 'គ្រប់គ្រងតួនាទីស្វ័យប្រវត្តិ\n`set`, `remove`, `view`',
              inline: false
            },
            {
              name: '/setup',
              value: 'ដំណើរការកំណត់ប្រព័ន្ធ\n`welcome`, `leave`, `welcomedm`, `leavedm`, `view`, `toggle`',
              inline: false
            },
            {
              name: '/info',
              value: 'បង្ហាញព័ត៌មានការកំណត់បច្ចុប្បន្ន',
              inline: false
            },
            {
              name: '/help',
              value: 'បង្ហាញព័ត៌មាននេះ',
              inline: false
            }
          )
          .addFields({
            name: '📝 អថេរដែលប្រើបាន',
            value: 
              '`{user}` - លើកឡើងអ្នកប្រើប្រាស់\n' +
              '`{user.username}` - ឈ្មោះអ្នកប្រើប្រាស់\n' +
              '`{user.id}` - ID អ្នកប្រើប្រាស់\n' +
              '`{server.name}` - ឈ្មោះម៉ាស៊ីនបម្រើ\n' +
              '`{membercount}` - ចំនួនសមាជិក\n' +
              '`{#channel}` - លើកឡើងឆានែល\n' +
              '`{@role}` - លើកឡើងតួនាទី',
            inline: false
          })
          .setFooter({ text: 'SMOS GANG Bot' })
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      // ============ INFO COMMAND ============
      case 'info': {
        const settings = getServerSettings(guild.id);
        
        const welcomeChannel = settings.welcomeChannel ? 
          `<#${settings.welcomeChannel}>` : 'មិនបានកំណត់';
        const leaveChannel = settings.leaveChannel ? 
          `<#${settings.leaveChannel}>` : 'មិនបានកំណត់';
        const autoRole = settings.autoRole ? 
          `<@&${settings.autoRole}>` : 'មិនបានកំណត់';
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📊 ការកំណត់របស់ ${guild.name}`)
          .addFields(
            { 
              name: '👋 ស្វាគមន៍', 
              value: `ឆានែល: ${welcomeChannel}\nស្ថានភាព: ${settings.enabled.welcome ? '🟢' : '🔴'}`,
              inline: true 
            },
            { 
              name: '👋 ចាកចេញ', 
              value: `ឆានែល: ${leaveChannel}\nស្ថានភាព: ${settings.enabled.leave ? '🟢' : '🔴'}`,
              inline: true 
            },
            { 
              name: '📩 DM ស្វាគមន៍', 
              value: `ស្ថានភាព: ${settings.enabled.welcomeDM ? '🟢' : '🔴'}`,
              inline: true 
            },
            { 
              name: '📩 DM ចាកចេញ', 
              value: `ស្ថានភាព: ${settings.enabled.leaveDM ? '🟢' : '🔴'}`,
              inline: true 
            },
            { 
              name: '🎭 តួនាទីស្វ័យប្រវត្តិ', 
              value: `តួនាទី: ${autoRole}\nស្ថានភាព: ${settings.enabled.autoRole ? '🟢' : '🔴'}`,
              inline: false 
            }
          )
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      // ============ SETUP COMMAND ============
      case 'setup': {
        const subcommand = options.getSubcommand();
        const settings = getServerSettings(guild.id);
        
        // Setup welcome channel
        if (subcommand === 'welcome') {
          const channel = options.getChannel('channel');
          const message = options.getString('message');
          
          const update = {
            welcomeChannel: channel.id,
            enabled: { ...settings.enabled, welcome: true }
          };
          if (message) update.welcomeMessage = message;
          
          updateServerSettings(guild.id, update);
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ បានកំណត់ឆានែលស្វាគមន៍')
            .addFields(
              { name: 'ឆានែល', value: channel.toString(), inline: true },
              { name: 'ស្ថានភាព', value: '🟢 បើក', inline: true }
            )
            .setTimestamp();
          
          if (message) {
            embed.addFields({ 
              name: 'សារផ្ទាល់ខ្លួន', 
              value: message.substring(0, 1000) + (message.length > 1000 ? '...' : ''),
              inline: false 
            });
          }
          
          await interaction.reply({ embeds: [embed] });
        }
        
        // Setup leave channel
        else if (subcommand === 'leave') {
          const channel = options.getChannel('channel');
          const message = options.getString('message');
          
          const update = {
            leaveChannel: channel.id,
            enabled: { ...settings.enabled, leave: true }
          };
          if (message) update.leaveMessage = message;
          
          updateServerSettings(guild.id, update);
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ បានកំណត់ឆានែលចាកចេញ')
            .addFields(
              { name: 'ឆានែល', value: channel.toString(), inline: true },
              { name: 'ស្ថានភាព', value: '🟢 បើក', inline: true }
            )
            .setTimestamp();
          
          if (message) {
            embed.addFields({ 
              name: 'សារផ្ទាល់ខ្លួន', 
              value: message.substring(0, 1000) + (message.length > 1000 ? '...' : ''),
              inline: false 
            });
          }
          
          await interaction.reply({ embeds: [embed] });
        }
        
        // Setup welcome DM
        else if (subcommand === 'welcomedm') {
          const message = options.getString('message');
          
          updateServerSettings(guild.id, {
            welcomeDM: message,
            enabled: { ...settings.enabled, welcomeDM: true }
          });
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ បានកំណត់សារ DM ស្វាគមន៍')
            .setDescription(`សារ: ${message.substring(0, 1000)}`)
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
        
        // Setup leave DM
        else if (subcommand === 'leavedm') {
          const message = options.getString('message');
          
          updateServerSettings(guild.id, {
            leaveDM: message,
            enabled: { ...settings.enabled, leaveDM: true }
          });
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ បានកំណត់សារ DM ចាកចេញ')
            .setDescription(`សារ: ${message.substring(0, 1000)}`)
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
        
        // View settings
        else if (subcommand === 'view') {
          const welcomeCh = settings.welcomeChannel ? 
            guild.channels.cache.get(settings.welcomeChannel)?.toString() || 'មិនឃើញ' : 'មិនបានកំណត់';
          const leaveCh = settings.leaveChannel ? 
            guild.channels.cache.get(settings.leaveChannel)?.toString() || 'មិនឃើញ' : 'មិនបានកំណត់';
          
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🔧 ការកំណត់បច្ចុប្បន្ន')
            .addFields(
              { 
                name: '👋 ស្វាគមន៍', 
                value: `ឆានែល: ${welcomeCh}\nស្ថានភាព: ${settings.enabled.welcome ? '🟢' : '🔴'}`,
                inline: false 
              },
              { 
                name: '👋 ចាកចេញ', 
                value: `ឆានែល: ${leaveCh}\nស្ថានភាព: ${settings.enabled.leave ? '🟢' : '🔴'}`,
                inline: false 
              },
              { 
                name: '📩 DM ស្វាគមន៍', 
                value: `ស្ថានភាព: ${settings.enabled.welcomeDM ? '🟢' : '🔴'}\nសារ: ${settings.welcomeDM ? '✅' : '❌'}`,
                inline: true 
              },
              { 
                name: '📩 DM ចាកចេញ', 
                value: `ស្ថានភាព: ${settings.enabled.leaveDM ? '🟢' : '🔴'}\nសារ: ${settings.leaveDM ? '✅' : '❌'}`,
                inline: true 
              }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
        
        // Toggle systems
        else if (subcommand === 'toggle') {
          const system = options.getString('system');
          const currentStatus = settings.enabled[system];
          const newStatus = !currentStatus;
          
          updateServerSettings(guild.id, {
            enabled: { ...settings.enabled, [system]: newStatus }
          });
          
          const systemNames = {
            welcome: 'ស្វាគមន៍',
            leave: 'ចាកចេញ',
            welcomeDM: 'DM ស្វាគមន៍',
            leaveDM: 'DM ចាកចេញ',
            autoRole: 'តួនាទីស្វ័យប្រវត្តិ'
          };
          
          await interaction.reply({
            content: `${newStatus ? '🟢' : '🔴'} ប្រព័ន្ធ **${systemNames[system]}** ឥឡូវនេះ ${newStatus ? 'បើក' : 'បិទ'}!`,
            ephemeral: true
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error('Command error:', error);
    await interaction.reply({
      content: '❌ មានបញ្ហាកើតឡើង! សូមព្យាយាមម្តងទៀត។',
      ephemeral: true
    });
  }
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Login
client.login(process.env.TOKEN);
