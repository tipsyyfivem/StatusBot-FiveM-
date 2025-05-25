const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Status message reference
let statusMessage = null;

// Listen for message delete events to check if our status message was deleted
client.on('messageDelete', message => {
  // Check if the deleted message is our status message
  if (statusMessage && message.id === statusMessage.id) {
    console.log('Status message was deleted, will create a new one on next update');
    statusMessage = null;
    config.messageid = undefined;
    updateConfigFile();
  }
});

// Login to Discord
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Try to fetch the existing status message if we have an ID stored
  if (config.messageid) {
    try {
      const channel = client.channels.cache.get(config.statusChannelId);
      if (channel) {
        try {
          statusMessage = await channel.messages.fetch(config.messageid);
          console.log(`Found existing status message with ID: ${config.messageid}`);
        } catch (err) {
          console.log(`Could not find message with ID: ${config.messageid}, will create a new one`);
          config.messageid = undefined;
          // We'll create a new message in updateServerStatus
        }
      }
    } catch (error) {
      console.error('Error fetching existing message:', error);
    }
  }
  
  // Start the status update loop
  updateServerStatus();
  setInterval(updateServerStatus, parseInt(config.updateInterval));
});

// Function to fetch server data
async function fetchServerData() {
  try {
    // FiveM API endpoints
    const playerDataUrl = `http://${config.serverIp}:${config.serverPort}/players.json`;
    const serverInfoUrl = `http://${config.serverIp}:${config.serverPort}/info.json`;
    
    // Fetch data from both endpoints
    const [playerResponse, infoResponse] = await Promise.all([
      axios.get(playerDataUrl, { timeout: 5000 }),
      axios.get(serverInfoUrl, { timeout: 5000 })
    ]);
    
    return {
      players: playerResponse.data || [],
      info: infoResponse.data || {},
      online: true,
      error: null
    };
  } catch (error) {
    console.error('Error fetching server data:', error.message);
    return {
      players: [],
      info: {},
      online: false,
      error: error.message
    };
  }
}

// Function to update server status message
async function updateServerStatus() {
  try {
    const statusChannel = client.channels.cache.get(config.statusChannelId);
    if (!statusChannel) {
      console.error('Status channel not found. Check STATUS_CHANNEL_ID in .env file.');
      return;
    }

    const serverData = await fetchServerData();
    const embed = createStatusEmbed(serverData);
    const actionRow = createActionRow();

    // If we already have a status message, edit it. Otherwise, send a new one.
    if (statusMessage) {
      try {
        await statusMessage.edit({ embeds: [embed], components: [actionRow] });
      } catch (error) {
        console.log('Error editing message, it may have been deleted. Creating a new one...');
        statusMessage = null;
        config.messageid = undefined;
        
        // Create a new message since the old one is gone
        statusMessage = await statusChannel.send({ embeds: [embed], components: [actionRow] });
        
        // Update config with the new message ID
        if (statusMessage) {
          config.messageid = statusMessage.id;
          updateConfigFile();
          console.log(`New status message created with ID: ${statusMessage.id}`);
        }
        return;
      }
    } else {
      // Delete previous bot messages in the channel
      const messages = await statusChannel.messages.fetch({ limit: 10 });
      const botMessages = messages.filter(m => m.author.id === client.user.id);
      if (botMessages.size > 0) {
        try {
          await statusChannel.bulkDelete(botMessages);
        } catch (error) {
          console.log('Could not bulk delete messages, they might be too old');
        }
      }
      
      // Send new status message
      statusMessage = await statusChannel.send({ embeds: [embed], components: [actionRow] });
      
      // Update config with the new message ID and save it
      if (statusMessage) {
        config.messageid = statusMessage.id;
        updateConfigFile();
        console.log(`New status message created with ID: ${statusMessage.id}`);
      }
    }
  } catch (error) {
    console.error('Error updating server status:', error);
  }
}

// Function to create the status embed
function createStatusEmbed(serverData) {
  const { players, online } = serverData;
  const maxPlayers = serverData.info.vars?.sv_maxClients || 150;
  const currentPlayers = players.length;
  
  const statusEmoji = online ? '🟢' : '🔴';
  const statusText = online ? 'Online & Operational' : 'Offline';
  
  const timestamp = new Date();
  const timeString = timestamp.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit'
  });

  return new EmbedBuilder()
    .setColor(online ? '#0099ff' : '#ff0000')
    .setAuthor({ name: "System Status", iconURL: config.imageurl })
    .setTitle(config.serverName)
    .setDescription(`The embed is updated every 1 minute with current player population, server, and CFX status.`)
    .addFields(
      { name: 'Server 1', value: `${currentPlayers}/${maxPlayers} in server`, inline: true },
      { name: 'Development', value: `${statusEmoji} ${statusText}`, inline: true },
      // { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Server 1 Status', value: `${statusEmoji} ${statusText}`, inline: false },
      { name: 'Cfx.re Status', value: `${statusEmoji} ${statusText}`, inline: false },
      { name: 'Server 1 Connect', value: `\`\`\`connect cfx.re/join/${config.cfxCode}\`\`\``, inline: false }
    )
    .setFooter({ text: `${config.serverName} • Today at ${timeString}`, iconURL: config.imageurl })
    .setTimestamp();
}

// Function to create action row with buttons
function createActionRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Connect')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('connect_button')
        .setEmoji('🌐'),
      new ButtonBuilder()
        .setLabel('Store')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('store_button')
        .setEmoji('🎁'),
      new ButtonBuilder()
        .setLabel('DevOps')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('devops_button')
        .setEmoji('🛠️'),
      new ButtonBuilder()
        .setLabel('Forums')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('forums_button')
        .setEmoji('🌐'),
      new ButtonBuilder()
        .setLabel('CAD')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('cad_button')
        .setEmoji('🌐')
    );
}

// Handle button interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  // You can customize these URLs to point to your actual resources
  const urls = {
    'connect_button': `fivem://connect/cfx.re/join/${config.cfxCode}`,
    'store_button': config.urls.store,
    'devops_button': config.urls.devops,
    'forums_button': config.urls.forums,
    'cad_button': config.urls.cad
  };
  
  const url = urls[interaction.customId];
  if (url) {
    await interaction.reply({ 
      content: `Here's your link: ${url}`, 
      ephemeral: true 
    });
  }
});

// Function to update the config file with the new message ID
function updateConfigFile() {
  try {
    const configPath = path.join(__dirname, 'config.js');
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    // Replace the messageid line with the new value
    configContent = configContent.replace(
      /messageid:\s*[^,\n}]*/, 
      `messageid: '${config.messageid}'`
    );
    
    fs.writeFileSync(configPath, configContent, 'utf8');
    console.log('Config file updated with new message ID');
  } catch (error) {
    console.error('Error updating config file:', error);
  }
}

// Login to Discord with the token
client.login(config.token);
