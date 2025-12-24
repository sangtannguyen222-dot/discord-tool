const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    REST,
    Routes,
    ActivityType,
    AuditLogEvent,
    ChannelType,
    Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const ms = require('ms');

// --- CẤU HÌNH ---
const TOKEN_PATH = './token.txt';
const DATA_DIR = './data';

// Đọc Token
let TOKEN;
try {
    TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
} catch (e) {
    console.error("Lỗi: Không tìm thấy file token.txt hoặc file trống.");
    process.exit(1);
}

// Khởi tạo Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// Biến toàn cục
const OWNER_ID = '1440617328189378561'; // ID đặc biệt
const SPECIAl_OWNER_TAG = '.nvynharry';
const BOT_CREATED_DATE = '11/12/2025';

// Map lưu AFK tạm thời
const afkUsers = new Map();

// --- HỆ THỐNG DỮ LIỆU ---

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Hàm lấy dữ liệu Guild (Có merge default để tránh lỗi thiếu key)
function getGuildData(guildId) {
    const filePath = path.join(DATA_DIR, `${guildId}.json`);
    const defaultData = {
        accountCreateTime: null,
        antiNukeAdmin: false,
        autoReply: {}, 
        autoReplyAdmin: {}, 
        blockedWords: [],
        authorizedRoleUsers: [],
        confirmRoleChannel: null,
        joinSuspend: false,
        newDmsMember: null,
        welcome: { content: null, channel: null },
        leave: { content: null, channel: null },
        restoreRole: false,
        leftUserRoles: {},
        roleJail: { roleId: null, channelId: null },
        jailedUsers: {},
        antiPing: [],
        roleHierarchyLock: false,
        autoRole: null,
        reportChannel: null,
        jailPendingRemoval: [],
        emojiTags: {}
    };

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 4));
        return defaultData;
    }

    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(rawData);
        // Merge với default để đảm bảo không bị thiếu key (Nguyên nhân crash)
        return { ...defaultData, ...data }; 
    } catch (error) {
        console.error(`Lỗi đọc file data guild ${guildId}:`, error);
        return defaultData; // Trả về default nếu file lỗi
    }
}

// Hàm lưu dữ liệu Guild
function saveGuildData(guildId, data) {
    const filePath = path.join(DATA_DIR, `${guildId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

// --- ĐĂNG KÝ LỆNH SLASH ---

const commands = [
    {
        name: 'about',
        description: 'Xem thông tin chi tiết về bot',
    },
    {
        name: 'account',
        description: 'Cài đặt thời gian tạo tài khoản tối thiểu',
        options: [
            {
                name: 'create_time',
                description: 'Thời gian tối thiểu (none để tắt)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Tắt (None)', value: 'none' },
                    { name: '1 ngày', value: '1d' },
                    { name: '3 ngày', value: '3d' },
                    { name: '7 ngày', value: '7d' },
                    { name: '2 tuần', value: '14d' },
                    { name: '1 tháng', value: '30d' },
                    { name: '2 tháng', value: '60d' },
                    { name: '3 tháng', value: '90d' },
                    { name: '4 tháng', value: '120d' },
                    { name: '5 tháng', value: '150d' },
                    { name: '6 tháng', value: '180d' },
                ]
            }
        ]
    },
    {
        name: 'help',
        description: 'Xem danh sách hỗ trợ',
    },
    {
        name: 'antinuke',
        description: 'Bật/Tắt chế độ Anti Nuke (Chỉ Admin/Owner)',
        options: [
            {
                name: 'mode',
                description: 'On hoặc Off',
                type: 3,
                required: true,
                choices: [{ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }]
            }
        ]
    },
    {
        name: 'autoreply',
        description: 'Quản lý tin nhắn tự động trả lời',
        options: [
            {
                name: 'add',
                description: 'Thêm trigger',
                type: 1, // SUB_COMMAND
                options: [
                    { name: 'trigger', description: 'Từ khóa', type: 3, required: true },
                    { name: 'reply', description: 'Nội dung trả lời', type: 3, required: true },
                    { name: 'admin_only', description: 'Chỉ trả lời Admin?', type: 5, required: false }
                ]
            },
            {
                name: 'remove',
                description: 'Xóa trigger',
                type: 1,
                options: [
                    { name: 'trigger', description: 'Từ khóa cần xóa', type: 3, required: true, autocomplete: true } 
                ]
            }
        ]
    },
    {
        name: 'block',
        description: 'Chặn từ ngữ xấu',
        options: [
            {
                name: 'language',
                description: 'Thêm hoặc xóa từ cấm',
                type: 1,
                options: [
                    { name: 'action', description: 'Add hoặc Remove', type: 3, required: true, choices: [{name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}] },
                    { name: 'word', description: 'Từ ngữ', type: 3, required: true }
                ]
            }
        ]
    },
    {
        name: 'confirm',
        description: 'Cài đặt xác nhận thêm Roles',
        options: [
            {
                name: 'additional_roles',
                description: 'Thiết lập người duyệt role',
                type: 1,
                options: [
                    { name: 'channel', description: 'Kênh thông báo', type: 7, required: true },
                    { name: 'user1', description: 'Người duyệt 1', type: 6, required: true },
                    { name: 'user2', description: 'Người duyệt 2', type: 6, required: false },
                    { name: 'user3', description: 'Người duyệt 3', type: 6, required: false },
                    { name: 'user4', description: 'Người duyệt 4', type: 6, required: false },
                    { name: 'user5', description: 'Người duyệt 5', type: 6, required: false },
                ]
            }
        ]
    },
    {
        name: 'resert',
        description: 'Các lệnh reset',
        options: [
            {
                name: 'confirm_additional_roles',
                description: 'Tắt tính năng duyệt Role',
                type: 1
            }
        ]
    },
    {
        name: 'delete',
        description: 'Xóa tin nhắn',
        options: [
            { name: 'amount', description: 'Số lượng tin nhắn', type: 4, required: true },
            { name: 'user', description: 'Chỉ xóa của user này', type: 6, required: false }
        ]
    },
    {
        name: 'new',
        description: 'Cài đặt DM thành viên mới',
        options: [
            {
                name: 'dms_member',
                description: 'Nội dung tin nhắn',
                type: 1,
                options: [{ name: 'content', description: 'Nội dung', type: 3, required: true }]
            },
            {
                name: 'dms_reset',
                description: 'Xóa cài đặt DM',
                type: 1
            }
        ]
    },
    {
        name: 'joinsuspend',
        description: 'Ngưng nhận thành viên mới',
        options: [
            { name: 'mode', description: 'On/Off', type: 3, required: true, choices: [{name: 'On', value: 'on'}, {name: 'Off', value: 'off'}] }
        ]
    },
    {
        name: 'remind',
        description: 'Hẹn giờ nhắc nhở',
        options: [
            { name: 'time', description: 'Thời gian (vd: 10s, 5p, 1d)', type: 3, required: true },
            { name: 'content', description: 'Nội dung nhắc', type: 3, required: true },
            { name: 'channel', description: 'Kênh nhắc', type: 7, required: true },
            { name: 'user', description: 'Người được nhắc', type: 6, required: true }
        ]
    },
    {
        name: 'invite',
        description: 'Lấy link mời bot',
    },
    {
        name: 'tag',
        description: 'Cài đặt Emoji Tag',
        options: [
            {
                name: 'emoji',
                description: 'Thêm trigger emoji',
                type: 1,
                options: [
                    { name: 'trigger', description: 'Từ khóa', type: 3, required: true },
                    { name: 'emoji', description: 'Emoji sẽ thêm', type: 3, required: true }
                ]
            },
            {
                name: 'remove',
                description: 'Xóa trigger emoji',
                type: 1,
                options: [
                    { name: 'trigger', description: 'Từ khóa cần xóa', type: 3, required: true }
                ]
            }
        ]
    },
    {
        name: 'welcome',
        description: 'Hệ thống chào mừng',
        options: [
            {
                name: 'setup',
                description: 'Cài đặt chào mừng',
                type: 1,
                options: [
                    { name: 'content', description: 'Nội dung (dùng @user để ping)', type: 3, required: true },
                    { name: 'channel', description: 'Kênh gửi', type: 7, required: true }
                ]
            },
            {
                name: 'remove',
                description: 'Tắt chào mừng',
                type: 1
            }
        ]
    },
    {
        name: 'leave',
        description: 'Hệ thống tạm biệt',
        options: [
            {
                name: 'setup',
                description: 'Cài đặt tạm biệt',
                type: 1,
                options: [
                    { name: 'content', description: 'Nội dung (dùng @user, <@Id>)', type: 3, required: true },
                    { name: 'channel', description: 'Kênh gửi', type: 7, required: true }
                ]
            },
            {
                name: 'remove',
                description: 'Tắt tạm biệt',
                type: 1
            }
        ]
    },
    {
        name: 'restore',
        description: 'Khôi phục Role',
        options: [
            {
                name: 'role',
                description: 'Bật/Tắt',
                type: 1,
                options: [{ name: 'mode', description: 'On/Off', type: 3, required: true, choices: [{name: 'On', value: 'on'}, {name: 'Off', value: 'off'}] }]
            }
        ]
    },
    {
        name: 'role',
        description: 'Các lệnh về role',
        options: [
            {
                name: 'jail',
                description: 'Cài đặt Role tù và Kênh tù',
                type: 1,
                options: [
                    { name: 'role', description: 'Role tù', type: 8, required: true },
                    { name: 'channel', description: 'Kênh tù', type: 7, required: true }
                ]
            }
        ]
    },
    {
        name: 'jail',
        description: 'Nhốt thành viên vào tù',
        options: [
            { name: 'user', description: 'Người bị nhốt', type: 6, required: true },
            { name: 'time', description: 'Thời gian (s/p/h/d)', type: 3, required: true }
        ]
    },
    {
        name: 'unjail',
        description: 'Thả thành viên',
        options: [
            { name: 'user', description: 'Người được thả', type: 6, required: true }
        ]
    },
    {
        name: 'anti',
        description: 'Chống Ping',
        options: [
            {
                name: 'ping',
                description: 'Cấu hình chống ping',
                type: 1,
                options: [
                    { name: 'action', description: 'Add/Remove', type: 3, required: true, choices: [{name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}] },
                    { name: 'user', description: 'Người được bảo vệ', type: 6, required: true }
                ]
            }
        ]
    },
    {
        name: 'rolehierarchy',
        description: 'Khóa vị trí Role',
        options: [
            {
                name: 'lock',
                description: 'On/Off',
                type: 1,
                options: [{ name: 'mode', description: 'On/Off', type: 3, required: true, choices: [{name: 'On', value: 'on'}, {name: 'Off', value: 'off'}] }]
            }
        ]
    },
    {
        name: 'auto',
        description: 'Tự động',
        options: [
            {
                name: 'role',
                description: 'Set auto role khi vào',
                type: 1,
                options: [{ name: 'role', description: 'Role', type: 8, required: true }]
            }
        ]
    },
    {
        name: 'say',
        description: 'Bot nói chuyện (Admin/Booster)',
        options: [
            { name: 'content', description: 'Nội dung', type: 3, required: true }
        ]
    },
    {
        name: 'set',
        description: 'Cài đặt chung',
        options: [
            {
                name: 'report',
                description: 'Set kênh report',
                type: 1,
                options: [{ name: 'channel', description: 'Kênh', type: 7, required: true }]
            }
        ]
    },
    {
        name: 'report',
        description: 'Báo cáo thành viên',
        options: [
            { name: 'user', description: 'Người bị báo cáo', type: 6, required: true },
            { name: 'content', description: 'Lý do', type: 3, required: true }
        ]
    }
];

// --- KHỞI CHẠY BOT ---

client.once('clientReady', async () => {
    console.log(`Đã đăng nhập: ${client.user.tag}`);
    client.user.setPresence({
        status: 'dnd', // Không làm phiền
        activities: [{
            name: 'Help bot .bot | GĐ aems ✨',
            type: ActivityType.Playing
        }]
    });

    // Đăng ký lệnh Slash
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Đang làm mới lệnh Slash...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Đã đăng ký xong lệnh Slash.');
    } catch (error) {
        console.error(error);
    }

    setInterval(checkJailExpirations, 60000); // Check mỗi 1 phút
    setInterval(checkReminders, 1000); // Check mỗi 1 giây
});

// --- XỬ LÝ SỰ KIỆN TƯƠNG TÁC ---

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            const command = interaction.commandName;
            const guildData = getGuildData(interaction.guild.id);
            
            if (command === 'autoreply') {
                const focusedValue = interaction.options.getFocused();
                const triggers = Object.keys(guildData.autoReply || {});
                const adminTriggers = Object.keys(guildData.autoReplyAdmin || {});
                const choices = triggers.concat(adminTriggers);
                const filtered = choices.filter(choice => choice.startsWith(focusedValue)).slice(0, 25);
                await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
            }
            return;
        }

        if (interaction.isButton()) {
            await handleButton(interaction);
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const { commandName, options, guild, user, member } = interaction;
        const guildData = getGuildData(guild.id);

        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        
        // --- LỆNH ABOUT ---
        if (commandName === 'about') {
            const uptime = ms(client.uptime, { long: true });
            const servers = client.guilds.cache.size;
            const users = client.users.cache.size;
            const channels = client.channels.cache.size;
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Thông tin chi tiết về SpectraX Bot')
                .setColor('#FFC0CB')
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription('SpectraX là bot Discord đa năng với các tính năng quản lý server mạnh mẽ và tiện ích hài hước.')
                .addFields(
                    { 
                        name: '🤖 Thông tin Bot', 
                        value: `**Tên:** ${client.user.username}\n**ID:** ${client.user.id}\n**Ngày tạo:** ${BOT_CREATED_DATE}\n**Prefix:** .\n**Uptime:** ${uptime}`,
                        inline: false 
                    },
                    { 
                        name: '👑 Chủ sở hữu', 
                        value: `**Tag:** ${SPECIAl_OWNER_TAG}\n**ID:** ${OWNER_ID}\n**Biệt danh:** Harry`,
                        inline: false 
                    },
                    { 
                        name: '📈 Thống kê', 
                        value: `**Servers:** ${servers}\n**Users:** ${users}\n**Channels:** ${channels}`,
                        inline: true 
                    },
                    { 
                        name: '⚡ Tính năng nổi bật', 
                        value: `• Anti-Nuke Protection\n• Auto-Role System\n• Jail System\n• Welcome/Leave Messages\n• AFK System\n• Auto-Reply\n• Report System`,
                        inline: true 
                    },
                    { 
                        name: '🔗 Liên kết', 
                        value: `[Support Server](https://discord.gg/traquanmongmo) | [Invite Bot](https://discord.com/oauth2/authorize?client_id=1448534787944878213)`,
                        inline: false 
                    }
                )
                .setFooter({ text: 'Cảm ơn bạn đã sử dụng SpectraX Bot!' })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH HELP ---
        else if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('🔰 Hướng dẫn sử dụng SpectraX Bot')
                .setColor('#00FFFF')
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription('Xin chào bạn, SpectraX lên để hỗ trợ bạn đây! <a:379936redhangingstars:1431952466550718464>\n\nDưới đây là các lệnh chính và tính năng của bot:')
                .addFields(
                    {
                        name: '🛠️ Lệnh Quản lý Server',
                        value: '`/antinuke` - Bật/tắt chống phá\n`/account` - Cài đặt thời gian tạo tài khoản\n`/role jail` - Cài đặt hệ thống tù\n`/jail` - Nhốt thành viên\n`/unjail` - Thả thành viên\n`/auto role` - Cài đặt auto role\n`/welcome` - Cài đặt chào mừng\n`/leave` - Cài đặt tạm biệt',
                        inline: true
                    },
                    {
                        name: '🔧 Lệnh Tiện ích',
                        value: '`/afk` - Đặt trạng thái AFK\n`/remind` - Đặt nhắc nhở\n`/report` - Báo cáo thành viên\n`/autoreply` - Cài đặt tự động trả lời\n`/block` - Chặn từ ngữ xấu\n`/anti ping` - Chống ping người dùng\n`/tag` - Cài đặt emoji tag',
                        inline: true
                    },
                    {
                        name: 'ℹ️ Lệnh Thông tin',
                        value: '`/about` - Thông tin bot\n`/help` - Hướng dẫn sử dụng\n`/invite` - Lấy link mời bot',
                        inline: true
                    }
                )
                .setImage('https://media.discordapp.net/attachments/1450778269208281118/1450779810845429841/From_KlickPin_CF_Landscapes_of_Snowy_MountainsWinter_Scenerynightloop_in_2025___Winter_scenery_Dark_nature_aesthetic_Beautiful_ocean_pictures.gif?ex=6947bbfd&is=69466a7d&hm=cfe15e281caf42937f8f80f2eed5c9039d0e9f5e1731fa7801fad8c3fa0869be&=&width=320&height=180')
                .setFooter({ text: 'Cần thêm hỗ trợ? Tham gia server của chúng tôi!' })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH INVITE ---
        else if (commandName === 'invite') {
            const embed = new EmbedBuilder()
                .setTitle('🔗 Mời SpectraX Bot')
                .setDescription('Nhấn nút bên dưới để mời SpectraX vào server của bạn và trải nghiệm các tính năng tuyệt vời!')
                .setColor('#00FF00')
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    {
                        name: '✨ Tại sao nên mời SpectraX?',
                        value: '• Bảo vệ server khỏi các cuộc tấn công\n• Quản lý thành viên hiệu quả\n• Tự động hóa nhiều tác vụ\n• Giao diện thân thiện và dễ sử dụng',
                        inline: false
                    }
                )
                .setFooter({ text: 'Cảm ơn bạn đã ủng hộ SpectraX!' });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Mời Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/oauth2/authorize?client_id=1448534787944878213`)
                    .setEmoji('🤖')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
        // --- LỆNH SAY ---
        else if (commandName === 'say') {
            if (!isAdmin && !member.premiumSince) return interaction.reply({ content: 'Bạn không có quyền dùng lệnh này.', ephemeral: true });
            const content = options.getString('content');
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setDescription(content)
                .setFooter({ text: `Tin nhắn từ ${user.tag}` })
                .setTimestamp();
                
            await interaction.reply({ content: `Đã gửi tin nhắn`, ephemeral: true });
            await interaction.channel.send({ embeds: [embed] });
        }
        // --- LỆNH REPORT ---
        else if (commandName === 'report') {
            const targetUser = options.getUser('user');
            const content = options.getString('content');
            
            if (!guildData.reportChannel) return interaction.reply({ content: 'Server chưa thiết lập kênh report (/set report).', ephemeral: true });
            const reportChannel = guild.channels.cache.get(guildData.reportChannel);
            if (!reportChannel) return interaction.reply({ content: 'Kênh report không tồn tại.', ephemeral: true });

            await interaction.reply({ content: 'Đã báo cáo thành công, hãy đợi admin xử lý.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🚨 BÁO CÁO THÀNH VIÊN')
                .setColor('#FF0000')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .addFields(
                    { name: '👤 Người báo cáo', value: `${user} (${user.id})`, inline: true },
                    { name: '🎯 Người bị báo cáo', value: `${targetUser} (${targetUser.id})`, inline: true },
                    { name: '📝 Lý do', value: content, inline: false },
                    { name: '⏰ Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false },
                    { name: '🌐 Server', value: guild.name, inline: true }
                )
                .setFooter({ text: 'ID báo cáo: ' + Math.random().toString(36).substring(2, 15) })
                .setTimestamp();
            
            await reportChannel.send({ content: `@everyone ${user} đã report ${targetUser}`, embeds: [embed] });
        }

        if (!isAdmin) {
            if (['antinuke', 'autoreply', 'block', 'confirm', 'resert', 'delete', 'new', 'joinsuspend', 'welcome', 'leave', 'restore', 'role', 'jail', 'unjail', 'anti', 'rolehierarchy', 'auto', 'set'].includes(commandName)) {
                return interaction.reply({ content: 'Bạn không có quyền quản lý để dùng lệnh này.', ephemeral: true });
            }
        }

        // --- LỆNH ACCOUNT CREATE TIME ---
        if (commandName === 'account') {
            const timeStr = options.getString('create_time');
            if (timeStr === 'none') {
                guildData.accountCreateTime = null;
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Cài đặt thời gian tạo tài khoản')
                    .setColor('#00FF00')
                    .setDescription('Đã tắt giới hạn thời gian tạo tài khoản. Mọi người đều có thể tham gia server.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            const timeMap = { '1d': '1 ngày', '3d': '3 ngày', '7d': '7 ngày', '14d': '2 tuần', '30d': '1 tháng', '60d': '2 tháng', '90d': '3 tháng', '120d': '4 tháng', '150d': '5 tháng', '180d': '6 tháng' };
            const msVal = ms(timeStr);
            guildData.accountCreateTime = msVal;
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Cài đặt thời gian tạo tài khoản')
                .setColor('#00FF00')
                .setDescription(`Đã đặt giới hạn tuổi tài khoản tối thiểu là: ${timeMap[timeStr]}`)
                .addFields(
                    { name: 'Thời gian', value: timeMap[timeStr], inline: true },
                    { name: 'Mili giây', value: msVal.toString(), inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH ANTINUKE ADMIN ---
        else if (commandName === 'antinuke') {
            if (user.id !== guild.ownerId && user.id !== OWNER_ID) {
                return interaction.reply({ content: 'Chỉ chủ sở hữu server hoặc chủ bot mới được dùng lệnh này.', ephemeral: true });
            }
            const mode = options.getString('mode');
            guildData.antiNukeAdmin = (mode === 'on');
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Cài đặt Anti-Nuke')
                .setColor(mode === 'on' ? '#00FF00' : '#FF0000')
                .setDescription(`Đã **${mode === 'on' ? 'BẬT' : 'TẮT'}** chế độ Anti Nuke Bot.`)
                .addFields(
                    { name: 'Trạng thái', value: mode === 'on' ? 'Bật' : 'Tắt', inline: true },
                    { name: 'Mô tả', value: mode === 'on' ? 'Bot sẽ tự động kick các bot được thêm bởi người không có quyền' : 'Bot sẽ không kiểm soát việc thêm bot mới', inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH AUTOREPLY ---
        else if (commandName === 'autoreply') {
            const sub = options.getSubcommand();
            if (sub === 'add') {
                const trigger = options.getString('trigger');
                const reply = options.getString('reply');
                const adminOnly = options.getBoolean('admin_only');

                if (adminOnly) {
                    if(!guildData.autoReplyAdmin) guildData.autoReplyAdmin = {};
                    guildData.autoReplyAdmin[trigger] = reply;
                } else {
                    if(!guildData.autoReply) guildData.autoReply = {};
                    guildData.autoReply[trigger] = reply;
                }
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('💬 Thêm Auto-Reply')
                    .setColor('#00FF00')
                    .setDescription(`Đã thêm auto-reply thành công!`)
                    .addFields(
                        { name: 'Từ khóa', value: `\`${trigger}\``, inline: true },
                        { name: 'Phản hồi', value: reply, inline: true },
                        { name: 'Chỉ Admin', value: adminOnly ? 'Có' : 'Không', inline: true }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            } else if (sub === 'remove') {
                const trigger = options.getString('trigger');
                let removed = false;
                
                if (guildData.autoReply && guildData.autoReply[trigger]) {
                    delete guildData.autoReply[trigger];
                    removed = true;
                }
                if (guildData.autoReplyAdmin && guildData.autoReplyAdmin[trigger]) {
                    delete guildData.autoReplyAdmin[trigger];
                    removed = true;
                }
                
                saveGuildData(guild.id, guildData);
                
                if (removed) {
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Xóa Auto-Reply')
                        .setColor('#FF0000')
                        .setDescription(`Đã xóa trigger: \`${trigger}\``)
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Lỗi')
                        .setColor('#FF0000')
                        .setDescription(`Không tìm thấy trigger: \`${trigger}\``)
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                }
            }
        }
        // --- LỆNH BLOCK LANGUAGE ---
        else if (commandName === 'block') {
            const action = options.getString('action');
            const word = options.getString('word');
            if (action === 'add') {
                if (!guildData.blockedWords.includes(word)) {
                    guildData.blockedWords.push(word);
                    saveGuildData(guild.id, guildData);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🚫 Thêm từ cấm')
                        .setColor('#FF0000')
                        .setDescription(`Đã thêm từ cấm: \`${word}\``)
                        .addFields(
                            { name: 'Tổng số từ cấm', value: guildData.blockedWords.length.toString(), inline: true }
                        )
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Cảnh báo')
                        .setColor('#FFFF00')
                        .setDescription(`Từ \`${word}\` đã có trong danh sách cấm.`)
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                }
            } else {
                guildData.blockedWords = guildData.blockedWords.filter(w => w !== word);
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Xóa từ cấm')
                    .setColor('#00FF00')
                    .setDescription(`Đã xóa từ cấm: \`${word}\``)
                    .addFields(
                        { name: 'Tổng số từ cấm', value: guildData.blockedWords.length.toString(), inline: true }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        }
        // --- LỆNH CONFIRM ADDITIONAL ROLES ---
        else if (commandName === 'confirm') {
            const channel = options.getChannel('channel');
            const users = [];
            for (let i = 1; i <= 5; i++) {
                const u = options.getUser(`user${i}`);
                if (u) users.push(u.id);
            }
            guildData.authorizedRoleUsers = users;
            guildData.confirmRoleChannel = channel.id;
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Cài đặt duyệt Role')
                .setColor('#00FF00')
                .setDescription(`Đã cài đặt hệ thống duyệt Role thành công!`)
                .addFields(
                    { name: 'Kênh thông báo', value: `${channel}`, inline: true },
                    { name: 'Số người duyệt', value: users.length.toString(), inline: true },
                    { name: 'Người được duyệt', value: users.map(u => `<@${u}>`).join(', ') || 'Không có', inline: false }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH RESET ---
        else if (commandName === 'resert' && options.getSubcommand() === 'confirm_additional_roles') {
            if (!guildData.authorizedRoleUsers.includes(user.id) && user.id !== guild.ownerId) {
                return interaction.reply({ content: 'Bạn không nằm trong danh sách được phép tắt tính năng này.', ephemeral: true });
            }
            guildData.authorizedRoleUsers = [];
            guildData.confirmRoleChannel = null;
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Tắt tính năng duyệt Role')
                .setColor('#FF0000')
                .setDescription(`Đã tắt tính năng xác nhận Role.`)
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH DELETE ---
        else if (commandName === 'delete') {
            const amount = options.getInteger('amount');
            const targetUser = options.getUser('user');

            if (amount > 100) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Lỗi')
                    .setColor('#FF0000')
                    .setDescription('Chỉ xóa tối đa 100 tin nhắn một lần.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await interaction.channel.messages.fetch({ limit: amount }).then(messages => {
                let messagesToDelete = messages;
                if (targetUser) {
                    messagesToDelete = messages.filter(m => m.author.id === targetUser.id);
                }
                interaction.channel.bulkDelete(messagesToDelete, true).catch(err => {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Lỗi')
                        .setColor('#FF0000')
                        .setDescription('Lỗi xóa tin nhắn (có thể do tin nhắn quá 14 ngày).')
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed], ephemeral: true });
                });
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Xóa tin nhắn')
                .setColor('#00FF00')
                .setDescription(`Đã xóa ${messagesToDelete.size} tin nhắn${targetUser ? ` của ${targetUser.tag}` : ''}.`)
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed], ephemeral: true });
        }
        // --- LỆNH NEW DMS ---
        else if (commandName === 'new') {
            const sub = options.getSubcommand();
            if (sub === 'dms_member') {
                const content = options.getString('content');
                guildData.newDmsMember = content;
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Cài đặt DM thành viên mới')
                    .setColor('#00FF00')
                    .setDescription('Đã lưu nội dung DM cho thành viên mới.')
                    .addFields(
                        { name: 'Nội dung', value: content.length > 1024 ? content.substring(0, 1021) + '...' : content, inline: false }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            } else {
                guildData.newDmsMember = null;
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ Tắt DM thành viên mới')
                    .setColor('#FF0000')
                    .setDescription('Đã tắt tính năng DM thành viên mới.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        }
        // --- LỆNH JOIN SUSPEND ---
        else if (commandName === 'joinsuspend') {
            const mode = options.getString('mode');
            guildData.joinSuspend = (mode === 'on');
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle(mode === 'on' ? '⏸️ Bật Join Suspend' : '▶️ Tắt Join Suspend')
                .setColor(mode === 'on' ? '#FFFF00' : '#00FF00')
                .setDescription(`Đã **${mode === 'on' ? 'BẬT' : 'TẮT'}** chế độ Join Suspend (Tạm ngưng tham gia).`)
                .addFields(
                    { name: 'Trạng thái', value: mode === 'on' ? 'Bật' : 'Tắt', inline: true },
                    { name: 'Mô tả', value: mode === 'on' ? 'Mọi thành viên mới sẽ bị kick ngay lập tức' : 'Thành viên mới có thể tham gia bình thường', inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH WELCOME / LEAVE ---
        else if (commandName === 'welcome') {
            const sub = options.getSubcommand();
            if (sub === 'setup') {
                guildData.welcome = { content: options.getString('content'), channel: options.getChannel('channel').id };
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('👋 Cài đặt chào mừng')
                    .setColor('#00FF00')
                    .setDescription('Đã cài đặt tin nhắn Chào mừng thành công!')
                    .addFields(
                        { name: 'Kênh', value: `<#${guildData.welcome.channel}>`, inline: true },
                        { name: 'Nội dung', value: guildData.welcome.content.length > 1024 ? guildData.welcome.content.substring(0, 1021) + '...' : guildData.welcome.content, inline: false }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            } else {
                guildData.welcome = { content: null, channel: null };
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ Tắt chào mừng')
                    .setColor('#FF0000')
                    .setDescription('Đã xóa cài đặt Chào mừng.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        }
        else if (commandName === 'leave') {
            const sub = options.getSubcommand();
            if (sub === 'setup') {
                guildData.leave = { content: options.getString('content'), channel: options.getChannel('channel').id };
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('👋 Cài đặt tạm biệt')
                    .setColor('#00FF00')
                    .setDescription('Đã cài đặt tin nhắn Tạm biệt thành công!')
                    .addFields(
                        { name: 'Kênh', value: `<#${guildData.leave.channel}>`, inline: true },
                        { name: 'Nội dung', value: guildData.leave.content.length > 1024 ? guildData.leave.content.substring(0, 1021) + '...' : guildData.leave.content, inline: false }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            } else {
                guildData.leave = { content: null, channel: null };
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ Tắt tạm biệt')
                    .setColor('#FF0000')
                    .setDescription('Đã xóa cài đặt Tạm biệt.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        }
        // --- LỆNH ROLE JAIL CONFIG ---
        else if (commandName === 'role' && options.getSubcommand() === 'jail') {
            const role = options.getRole('role');
            const channel = options.getChannel('channel');

            guildData.roleJail = { roleId: role.id, channelId: channel.id };
            saveGuildData(guild.id, guildData);
            
            channel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
            channel.permissionOverwrites.edit(role.id, { ViewChannel: true, SendMessages: true });
            
            guild.channels.cache.forEach(c => {
                if (c.id !== channel.id) {
                    c.permissionOverwrites.edit(role.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('🔒 Cài đặt Role Jail')
                .setColor('#FF0000')
                .setDescription('Đã thiết lập hệ thống Jail thành công!')
                .addFields(
                    { name: 'Role Jail', value: `${role}`, inline: true },
                    { name: 'Kênh Jail', value: `${channel}`, inline: true },
                    { name: 'Mô tả', value: 'Thành viên bị jail sẽ chỉ có thể xem và nhắn tin trong kênh Jail', inline: false }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH JAIL ---
        else if (commandName === 'jail') {
            const targetUser = options.getUser('user');
            const timeStr = options.getString('time');
            
            if (!guildData.roleJail.roleId || !guildData.roleJail.channelId) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Lỗi')
                    .setColor('#FF0000')
                    .setDescription('Chưa thiết lập Role Jail và Kênh Jail (/role jail).')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            let duration = 0;
            let timeDisplay = '';
            const unit = timeStr.slice(-1);
            const val = parseInt(timeStr.slice(0, -1));
            if (unit === 's') {
                duration = val * 1000;
                timeDisplay = `${val} giây`;
            }
            else if (unit === 'p') {
                duration = val * 60000;
                timeDisplay = `${val} phút`;
            }
            else if (unit === 'h') {
                duration = val * 3600000;
                timeDisplay = `${val} giờ`;
            }
            else if (unit === 'd') {
                duration = val * 86400000;
                timeDisplay = `${val} ngày`;
            }
            else if (unit === 't') {
                duration = val * 2592000000;
                timeDisplay = `${val} tháng`;
            }
            else {
                duration = ms(timeStr) || 0;
                timeDisplay = timeStr;
            }

            if (!duration) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Lỗi')
                    .setColor('#FF0000')
                    .setDescription('Thời gian không hợp lệ.')
                    .addFields(
                        { name: 'Định dạng hợp lệ', value: 's (giây), p (phút), h (giờ), d (ngày), t (tháng)', inline: false }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚖️ XÁC NHẬN NHỐT')
                .setColor('#FFFF00')
                .setDescription(`Bạn có chắc chắn muốn nhốt ${targetUser} trong ${timeDisplay}?`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Thành viên', value: `${targetUser} (${targetUser.id})`, inline: true },
                    { name: 'Thời gian', value: timeDisplay, inline: true },
                    { name: 'Thời gian hết hạn', value: `<t:${Math.floor((Date.now() + duration)/1000)}:F>`, inline: false }
                )
                .setFooter({ text: `Hành động này sẽ xóa tất cả roles của thành viên và thêm role Jail` })
                .setTimestamp();
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`jail_yes_${targetUser.id}_${duration}`).setLabel('Có').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('jail_no').setLabel('Không').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
        // --- LỆNH UNJAIL ---
        else if (commandName === 'unjail') {
            const targetUser = options.getUser('user');
            if (!guildData.jailedUsers[targetUser.id]) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Lỗi')
                    .setColor('#FF0000')
                    .setDescription('Người này không bị nhốt bởi bot.')
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            await unjailUser(guild, targetUser.id);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Thả thành viên')
                .setColor('#00FF00')
                .setDescription(`Đã thả ${targetUser} khỏi tù.`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Thành viên', value: `${targetUser} (${targetUser.id})`, inline: true },
                    { name: 'Thời gian thả', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH ANTI PING ---
        else if (commandName === 'anti') {
            const sub = options.getSubcommand();
            if (sub === 'ping') {
                const action = options.getString('action');
                const targetUser = options.getUser('user');
                
                if (action === 'add') {
                    if (!guildData.antiPing.includes(targetUser.id)) {
                        guildData.antiPing.push(targetUser.id);
                        saveGuildData(guild.id, guildData);
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🔕 Bật Anti-Ping')
                            .setColor('#00FF00')
                            .setDescription(`Đã bật Anti-Ping cho ${targetUser}.`)
                            .addFields(
                                { name: 'Thành viên', value: `${targetUser} (${targetUser.id})`, inline: true },
                                { name: 'Mô tả', value: 'Mọi tin nhắn ping thành viên này sẽ bị xóa', inline: true }
                            )
                            .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                            .setTimestamp();
                        interaction.reply({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('⚠️ Cảnh báo')
                            .setColor('#FFFF00')
                            .setDescription(`Anti-Ping đã được bật cho ${targetUser}.`)
                            .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                            .setTimestamp();
                        interaction.reply({ embeds: [embed] });
                    }
                } else {
                    guildData.antiPing = guildData.antiPing.filter(id => id !== targetUser.id);
                    saveGuildData(guild.id, guildData);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔔 Tắt Anti-Ping')
                        .setColor('#FF0000')
                        .setDescription(`Đã tắt Anti-Ping cho ${targetUser}.`)
                        .addFields(
                            { name: 'Thành viên', value: `${targetUser} (${targetUser.id})`, inline: true },
                            { name: 'Mô tả', value: 'Thành viên này có thể bị ping bình thường', inline: true }
                        )
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                }
            }
        }
        // --- LỆNH AUTO ROLE ---
        else if (commandName === 'auto' && options.getSubcommand() === 'role') {
            const role = options.getRole('role');
            guildData.autoRole = role.id;
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('🎭 Cài đặt Auto-Role')
                .setColor('#00FF00')
                .setDescription(`Đã đặt Auto-Role: ${role}`)
                .addFields(
                    { name: 'Role', value: `${role}`, inline: true },
                    { name: 'ID', value: role.id, inline: true },
                    { name: 'Mô tả', value: 'Tất cả thành viên mới sẽ tự động nhận role này khi tham gia server', inline: false }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH SET REPORT ---
        else if (commandName === 'set' && options.getSubcommand() === 'report') {
            const channel = options.getChannel('channel');
            guildData.reportChannel = channel.id;
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle('📝 Cài đặt kênh Report')
                .setColor('#00FF00')
                .setDescription(`Đã đặt kênh Report: ${channel}`)
                .addFields(
                    { name: 'Kênh', value: `${channel}`, inline: true },
                    { name: 'Mô tả', value: 'Tất cả báo cáo thành viên sẽ được gửi đến kênh này', inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH TAG EMOJI ---
        else if (commandName === 'tag') {
            const sub = options.getSubcommand();
            if (sub === 'emoji') {
                if(!guildData.emojiTags) guildData.emojiTags = {};
                guildData.emojiTags[options.getString('trigger')] = options.getString('emoji');
                saveGuildData(guild.id, guildData);
                
                const embed = new EmbedBuilder()
                    .setTitle('😊 Thêm Emoji Tag')
                    .setColor('#00FF00')
                    .setDescription('Đã thêm emoji tag thành công!')
                    .addFields(
                        { name: 'Từ khóa', value: `\`${options.getString('trigger')}\``, inline: true },
                        { name: 'Emoji', value: options.getString('emoji'), inline: true }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            } else {
                const trigger = options.getString('trigger');
                if(guildData.emojiTags && guildData.emojiTags[trigger]) {
                    delete guildData.emojiTags[trigger];
                    saveGuildData(guild.id, guildData);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Xóa Emoji Tag')
                        .setColor('#FF0000')
                        .setDescription(`Đã xóa emoji tag: \`${trigger}\``)
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Lỗi')
                        .setColor('#FF0000')
                        .setDescription(`Không tìm thấy trigger: \`${trigger}\``)
                        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                        .setTimestamp();
                    interaction.reply({ embeds: [embed] });
                }
            }
        }
        // --- LỆNH REMIND ---
        else if (commandName === 'remind') {
            const timeStr = options.getString('time');
            let duration = 0;
            let timeDisplay = '';
            const unit = timeStr.slice(-1);
            const val = parseInt(timeStr.slice(0, -1));
            if (unit === 's') {
                duration = val * 1000;
                timeDisplay = `${val} giây`;
            }
            else if (unit === 'p') {
                duration = val * 60000;
                timeDisplay = `${val} phút`;
            }
            else if (unit === 'h') {
                duration = val * 3600000;
                timeDisplay = `${val} giờ`;
            }
            else if (unit === 'd') {
                duration = val * 86400000;
                timeDisplay = `${val} ngày`;
            }
            else if (unit === 't') {
                duration = val * 2592000000;
                timeDisplay = `${val} tháng`;
            }
            else {
                duration = ms(timeStr);
                timeDisplay = timeStr;
            }

            if(!duration) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Lỗi')
                    .setColor('#FF0000')
                    .setDescription('Thời gian không đúng định dạng.')
                    .addFields(
                        { name: 'Định dạng hợp lệ', value: 's (giây), p (phút), h (giờ), d (ngày), t (tháng)', inline: false }
                    )
                    .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            const content = options.getString('content');
            const channel = options.getChannel('channel');
            const targetUser = options.getUser('user');

            if (!global.reminders) global.reminders = [];
            global.reminders.push({
                endTime: Date.now() + duration,
                content: content,
                channelId: channel.id,
                userId: targetUser.id,
                guildId: guild.id
            });
            
            const embed = new EmbedBuilder()
                .setTitle('⏰ Đặt nhắc nhở')
                .setColor('#00FFFF')
                .setDescription(`Đã đặt nhắc nhở thành công!`)
                .addFields(
                    { name: 'Nội dung', value: content, inline: false },
                    { name: 'Người được nhắc', value: `${targetUser}`, inline: true },
                    { name: 'Kênh', value: `${channel}`, inline: true },
                    { name: 'Thời gian', value: timeDisplay, inline: true },
                    { name: 'Thời gian nhắc', value: `<t:${Math.floor((Date.now() + duration)/1000)}:F>`, inline: false }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH RESTORE ROLE ---
        else if (commandName === 'restore') {
            const mode = options.getString('mode');
            guildData.restoreRole = (mode === 'on');
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle(mode === 'on' ? '✅ Bật khôi phục Role' : '❌ Tắt khôi phục Role')
                .setColor(mode === 'on' ? '#00FF00' : '#FF0000')
                .setDescription(`Đã **${mode === 'on' ? 'BẬT' : 'TẮT'}** tính năng khôi phục role.`)
                .addFields(
                    { name: 'Trạng thái', value: mode === 'on' ? 'Bật' : 'Tắt', inline: true },
                    { name: 'Mô tả', value: mode === 'on' ? 'Bot sẽ lưu lại role của thành viên khi rời server và trả lại khi họ tham gia lại' : 'Bot sẽ không lưu lại role của thành viên khi rời server', inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
        // --- LỆNH ROLE HIERARCHY LOCK ---
        else if (commandName === 'rolehierarchy') {
            const mode = options.getString('mode');
            guildData.roleHierarchyLock = (mode === 'on');
            saveGuildData(guild.id, guildData);
            
            const embed = new EmbedBuilder()
                .setTitle(mode === 'on' ? '🔒 Bật khóa vị trí Role' : '🔓 Tắt khóa vị trí Role')
                .setColor(mode === 'on' ? '#FFFF00' : '#00FF00')
                .setDescription(`Đã **${mode === 'on' ? 'BẬT' : 'TẮT'}** tính năng khóa vị trí Role.`)
                .addFields(
                    { name: 'Trạng thái', value: mode === 'on' ? 'Bật' : 'Tắt', inline: true },
                    { name: 'Mô tả', value: mode === 'on' ? 'Bot sẽ tự động khôi phục vị trí của role khi bị thay đổi' : 'Bot sẽ không can thiệp khi vị trí role bị thay đổi', inline: true }
                )
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            interaction.reply({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Lỗi Interaction:", e);
    }
});

// --- XỬ LÝ BUTTON INTERACTION (JAIL & CONFIRM ROLE) ---
async function handleButton(interaction) {
    try {
        const { customId, guild, user } = interaction;
        const guildData = getGuildData(guild.id);

        if (customId.startsWith('jail_yes_')) {
            const [_, _yes, targetId, durationStr] = customId.split('_');
            const duration = parseInt(durationStr);
            const member = await guild.members.fetch(targetId).catch(() => null);

            if (member) {
                const oldRoles = member.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).map(r => r.id);
                guildData.jailedUsers[targetId] = {
                    endTime: Date.now() + duration,
                    oldRoles: oldRoles
                };
                saveGuildData(guild.id, guildData);

                await member.roles.remove(oldRoles).catch(e => console.log(e));
                await member.roles.add(guildData.roleJail.roleId).catch(e => console.log(e));

                const jailChannel = guild.channels.cache.get(guildData.roleJail.channelId);
                if (jailChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚖️ THÔNG BÁO NHỐT')
                        .setColor('#FF0000')
                        .setDescription(`Người dùng ${member} đã bị nhốt!`)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '👮 Người thi hành', value: `${user}`, inline: true },
                            { name: '🔗 Người bị nhốt', value: `${member}`, inline: true },
                            { name: '⏰ Thời gian thả', value: `<t:${Math.floor((Date.now() + duration)/1000)}:R>`, inline: false },
                            { name: '📅 Ngày bị nhốt', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
                            { name: '📅 Ngày thả dự kiến', value: `<t:${Math.floor((Date.now() + duration)/1000)}:F>`, inline: true },
                            { name: '📝 Lý do', value: 'Nhốt bởi quản trị viên', inline: false }
                        )
                        .setFooter({ text: `ID: ${member.id}` })
                        .setTimestamp();
                    await jailChannel.send({ content: `${member}`, embeds: [embed] });
                }
            }
            await interaction.message.delete();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Thực hiện lệnh nhốt')
                .setColor('#00FF00')
                .setDescription(`Đã nhốt thành công thành viên.`)
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } 
        else if (customId === 'jail_no') {
            await interaction.message.delete();
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Hủy lệnh nhốt')
                .setColor('#FF0000')
                .setDescription(`Đã hủy lệnh nhốt.`)
                .setFooter({ text: `Thực hiện bởi ${user.tag}` })
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        else if (customId.startsWith('role_approve_') || customId.startsWith('role_deny_')) {
            if (!guildData.authorizedRoleUsers.includes(user.id)) {
                return interaction.reply({ content: 'Bạn không có quyền bấm nút này.', ephemeral: true });
            }

            const [action, _tag, targetId, roleId, type] = customId.split('_'); 
            const member = await guild.members.fetch(targetId).catch(() => null);
            const role = guild.roles.cache.get(roleId);

            if (customId.startsWith('role_approve_')) {
                if (member && role) {
                    global.roleChangeApproved = global.roleChangeApproved || {};
                    global.roleChangeApproved[`${targetId}_${roleId}`] = true;

                    if (type === 'add') await member.roles.add(role);
                    else await member.roles.remove(role);

                    const embed = new EmbedBuilder()
                        .setTitle('✅ Duyệt thay đổi Role')
                        .setColor('#00FF00')
                        .setDescription(`${user} đã duyệt ${type === 'add' ? 'thêm' : 'xóa'} role ${role.name} cho ${member.user.tag}`)
                        .addFields(
                            { name: 'Người duyệt', value: `${user}`, inline: true },
                            { name: 'Thành viên', value: `${member}`, inline: true },
                            { name: 'Role', value: `${role}`, inline: true },
                            { name: 'Hành động', value: type === 'add' ? 'Thêm' : 'Xóa', inline: true }
                        )
                        .setFooter({ text: `ID: ${member.id}` })
                        .setTimestamp();
                    await interaction.channel.send({ embeds: [embed] });
                }
                await interaction.message.delete();
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Từ chối thay đổi Role')
                    .setColor('#FF0000')
                    .setDescription(`${user} đã từ chối ${type === 'add' ? 'thêm' : 'xóa'} role ${role.name} cho ${member.user.tag}`)
                    .addFields(
                        { name: 'Người từ chối', value: `${user}`, inline: true },
                        { name: 'Thành viên', value: `${member}`, inline: true },
                        { name: 'Role', value: `${role}`, inline: true },
                        { name: 'Hành động', value: type === 'add' ? 'Thêm' : 'Xóa', inline: true }
                    )
                    .setFooter({ text: `ID: ${member.id}` })
                    .setTimestamp();
                await interaction.channel.send({ embeds: [embed] });
                await interaction.message.delete();
            }
        }
    } catch(e) { 
        console.error(e); 
    }
}

async function checkJailExpirations() {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const guildId = file.replace('.json', '');
        let guildData = getGuildData(guildId);
        const now = Date.now();
        const expiredUsers = [];
        for (const [userId, info] of Object.entries(guildData.jailedUsers)) {
            if (info.endTime <= now) {
                expiredUsers.push(userId);
            }
        }

        if (expiredUsers.length > 0) {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                for (const userId of expiredUsers) {
                    await unjailUser(guild, userId);
                    guildData = getGuildData(guildId);
                    if (guildData.jailedUsers[userId]) {
                        delete guildData.jailedUsers[userId];
                        saveGuildData(guildId, guildData);
                    }
                }
            }
        }
    }
}

async function unjailUser(guild, userId) {
    const guildData = getGuildData(guild.id);
    const member = await guild.members.fetch(userId).catch(() => null);
    
    if (member) {
        const jailData = guildData.jailedUsers[userId];
        if (jailData && jailData.oldRoles) {
            await member.roles.add(jailData.oldRoles).catch(e => console.log('Không thể add role cũ:', e));
        }
        if (guildData.roleJail.roleId) {
            await member.roles.remove(guildData.roleJail.roleId).catch(e => console.log('Không thể xóa role tù:', e));
        }
        
        // Gửi thông báo thả tù
        const jailChannel = guild.channels.cache.get(guildData.roleJail.channelId);
        if (jailChannel) {
            const embed = new EmbedBuilder()
                .setTitle('🔓 THÔNG BÁO THẢ TÙ')
                .setColor('#00FF00')
                .setDescription(`Người dùng ${member} đã được thả khỏi tù!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Thành viên', value: `${member}`, inline: true },
                    { name: '⏰ Thời gian thả', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
                    { name: '📝 Lý do', value: 'Hết hạn tù', inline: false }
                )
                .setFooter({ text: `ID: ${member.id}` })
                .setTimestamp();
            await jailChannel.send({ content: `${member}`, embeds: [embed] });
        }
    }

    // Reset kênh Jail
    const jailChannel = guild.channels.cache.get(guildData.roleJail.channelId);
    if (jailChannel) {
        try {
            const newChannel = await jailChannel.clone();
            await jailChannel.delete();
            guildData.roleJail.channelId = newChannel.id;
            saveGuildData(guild.id, guildData);
        } catch (error) {
            console.error("Lỗi khi làm mới kênh Jail:", error);
        }
    }
}

async function checkReminders() {
    if (!global.reminders) return;
    const now = Date.now();
    const pending = global.reminders.filter(r => r.endTime <= now);
    global.reminders = global.reminders.filter(r => r.endTime > now);

    for (const r of pending) {
        const guild = client.guilds.cache.get(r.guildId);
        if (guild) {
            const channel = guild.channels.cache.get(r.channelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('⏰ NHẮC NHỞ')
                    .setColor('#00FFFF')
                    .setDescription(r.content)
                    .addFields(
                        { name: 'Người được nhắc', value: `<@${r.userId}>`, inline: true },
                        { name: 'Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                    )
                    .setFooter({ text: 'Nhắc nhở tự động từ SpectraX Bot' })
                    .setTimestamp();
                await channel.send({ content: `<@${r.userId}>`, embeds: [embed] });
            }
        }
    }
}

// --- MESSAGE CREATE ---

client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;
        const guildData = getGuildData(message.guild.id);

        // 1. Anti Ping
        if (guildData.antiPing && guildData.antiPing.length > 0) {
            const mentioned = message.mentions.users;
            if (mentioned.size > 0) {
                const hasProtected = mentioned.some(u => guildData.antiPing.includes(u.id));
                if (hasProtected) {
                    await message.delete().catch(() => {});
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔕 Anti-Ping')
                        .setColor('#FF0000')
                        .setDescription(`Bạn không được ping thành viên này!`)
                        .addFields(
                            { name: 'Người gửi', value: `${message.author}`, inline: true },
                            { name: 'Nội dung', value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content, inline: false }
                        )
                        .setFooter({ text: 'Tin nhắn đã bị xóa' })
                        .setTimestamp();
                    await message.channel.send({ embeds: [embed] }).then(m => setTimeout(() => m.delete(), 5000));
                    return;
                }
            }
        }

        // 2. Block Language
        if (guildData.blockedWords && guildData.blockedWords.some(word => message.content.includes(word))) {
            await message.delete().catch(() => {});
            
            const embed = new EmbedBuilder()
                .setTitle('🚫 Từ ngữ không phù hợp')
                .setColor('#FF0000')
                .setDescription(`Vui lòng không sử dụng từ ngữ không phù hợp trong server!`)
                .addFields(
                    { name: 'Người gửi', value: `${message.author}`, inline: true },
                    { name: 'Nội dung', value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content, inline: false }
                )
                .setFooter({ text: 'Tin nhắn đã bị xóa' })
                .setTimestamp();
            await message.channel.send({ embeds: [embed] }).then(m => setTimeout(() => m.delete(), 5000));
            return;
        }

        // 3. AFK Check (Người chat hết AFK)
        if (afkUsers.has(message.author.id)) {
            const info = afkUsers.get(message.author.id);
            afkUsers.delete(message.author.id);
            const duration = ms(Date.now() - info.startTime, { long: true });
            
            const embed = new EmbedBuilder()
                .setTitle('👋 Chào mừng trở lại')
                .setColor('#00FF00')
                .setDescription(`Chào mừng bạn quay lại! Bạn đã AFK được ${duration}. <a:zzz:1450739617614794773>`)
                .addFields(
                    { name: 'Thành viên', value: `${message.author}`, inline: true },
                    { name: 'Lý do AFK', value: info.reason, inline: true },
                    { name: 'Thời gian AFK', value: duration, inline: true }
                )
                .setFooter({ text: 'Đã xóa trạng thái AFK' })
                .setTimestamp();
            await message.reply({ embeds: [embed] }).then(m => setTimeout(() => m.delete(), 10000));
        }

        // 4. AFK Check (Người bị ping đang AFK)
        message.mentions.users.forEach(u => {
            if (afkUsers.has(u.id)) {
                const info = afkUsers.get(u.id);
                const duration = ms(Date.now() - info.startTime, { long: true });
                
                const embed = new EmbedBuilder()
                    .setTitle('😴 Thông báo AFK')
                    .setColor('#FFFF00')
                    .setDescription(`${u} Đã đi afk với lý do: **${info.reason}**\nAfk được: ${duration} <a:zzz:1450739617614794773>`)
                    .addFields(
                        { name: 'Thành viên', value: `${u}`, inline: true },
                        { name: 'Lý do AFK', value: info.reason, inline: true },
                        { name: 'Thời gian AFK', value: duration, inline: true }
                    )
                    .setFooter({ text: `AFK từ <t:${Math.floor(info.startTime/1000)}:F>` })
                    .setTimestamp();
                message.reply({ embeds: [embed] });
            }
        });

        // 5. Lệnh .afk
        if (message.content.startsWith('.afk')) {
            const reason = message.content.slice(5).trim() || 'Không có lý do';
            afkUsers.set(message.author.id, { reason: reason, startTime: Date.now() });
            
            const embed = new EmbedBuilder()
                .setTitle('😴 Đặt trạng thái AFK')
                .setColor('#FFFF00')
                .setDescription(`${message.author} Đã afk với lý do: **${reason}**\nBắt đầu từ <t:${Math.floor(Date.now()/1000)}:R> <a:8107milkandmochi10:1413785879251517471>`)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Thành viên', value: `${message.author}`, inline: true },
                    { name: 'Lý do', value: reason, inline: true },
                    { name: 'Thời gian bắt đầu', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Sử dụng .afk để đặt trạng thái AFK' })
                .setTimestamp();
            message.channel.send({ embeds: [embed] });
        }

        // 6. Auto Reply
        if (guildData.autoReply && guildData.autoReply[message.content]) {
            message.channel.send(guildData.autoReply[message.content]);
        }
        // Auto Reply Admin
        if (guildData.autoReplyAdmin && guildData.autoReplyAdmin[message.content]) {
            const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
            if (isAdmin) {
                message.channel.send(guildData.autoReplyAdmin[message.content]);
            }
        }

        // 7. Tag Emoji
        if (guildData.emojiTags) {
            for (const [trigger, emoji] of Object.entries(guildData.emojiTags)) {
                if (message.content.includes(trigger)) {
                    try {
                        await message.react(emoji);
                    } catch (e) {
                        // Nếu là custom emoji khác server hoặc lỗi thì có thể reply
                        // message.reply(emoji);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Lỗi trong messageCreate:", e);
    }
});

// --- MEMBER EVENTS ---

client.on('guildMemberAdd', async member => {
    try {
        const guildData = getGuildData(member.guild.id);

        if (guildData.joinSuspend) {
            await member.send("Server đã tạm ngưng tham gia").catch(() => {});
            await member.kick('Join Suspend Mode').catch(() => {});
            return;
        }

        if (guildData.accountCreateTime) {
            const accountAge = Date.now() - member.user.createdTimestamp;
            if (accountAge < guildData.accountCreateTime) {
                await member.send("Tài khoản của bạn chưa đủ tuổi để vào server").catch(() => {});
                await member.kick('Account Age Limit').catch(() => {});
                return;
            }
        }

        if (guildData.autoRole) {
            const role = member.guild.roles.cache.get(guildData.autoRole);
            if (role) await member.roles.add(role).catch(() => {});
        }

        if (guildData.restoreRole && guildData.leftUserRoles[member.id]) {
            const roleIds = guildData.leftUserRoles[member.id];
            for (const rid of roleIds) {
                const r = member.guild.roles.cache.get(rid);
                if (r) await member.roles.add(r).catch(() => {});
            }
        }

        if (guildData.newDmsMember) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Chào mừng đến với server!')
                .setColor('#00FF00')
                .setDescription(guildData.newDmsMember)
                .setThumbnail(member.guild.iconURL({ dynamic: true }))
                .setFooter({ text: `Server: ${member.guild.name}` })
                .setTimestamp();
            await member.send({ embeds: [embed] }).catch(() => {});
        }

        if (guildData.welcome.channel && guildData.welcome.content) {
            const channel = member.guild.channels.cache.get(guildData.welcome.channel);
            if (channel) {
                let msg = guildData.welcome.content.replace('@user', `<@${member.id}>`);
                
                const embed = new EmbedBuilder()
                    .setTitle('👋 Chào mừng thành viên mới!')
                    .setColor('#00FF00')
                    .setDescription(msg)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: 'Thành viên', value: `${member}`, inline: true },
                        { name: 'ID', value: member.id, inline: true },
                        { name: 'Ngày tạo tài khoản', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:F>`, inline: true },
                        { name: 'Tổng thành viên', value: member.guild.memberCount.toString(), inline: true }
                    )
                    .setFooter({ text: `Chào mừng đến với ${member.guild.name}!` })
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            }
        }

        // Anti Nuke Bot
        if (member.user.bot && guildData.antiNukeAdmin) {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(()=>null);
            if(logs) {
                const entry = logs.entries.first();
                if (entry && entry.executor.id !== member.guild.ownerId && entry.executor.id !== OWNER_ID) {
                    await member.kick('Anti Nuke Bot: Người thêm không hợp lệ.');
                    
                    // Gửi thông báo anti-nuke
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ Anti-Nuke Bot')
                        .setColor('#FF0000')
                        .setDescription(`Đã kick bot ${member} do được thêm bởi người không có quyền!`)
                        .addFields(
                            { name: 'Bot bị kick', value: `${member} (${member.id})`, inline: true },
                            { name: 'Người thêm', value: `${entry.executor} (${entry.executor.id})`, inline: true },
                            { name: 'Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                        )
                        .setFooter({ text: 'Chế độ Anti-Nuke đã kích hoạt' })
                        .setTimestamp();
                    
                    // Gửi vào kênh chung hoặc kênh log nếu có
                    const logChannel = member.guild.systemChannel;
                    if (logChannel) {
                        await logChannel.send({ embeds: [embed] });
                    }
                }
            }
        }
    } catch(e) { 
        console.error(e); 
    }
});

client.on('guildMemberRemove', async member => {
    try {
        const guildData = getGuildData(member.guild.id);
        if (guildData.restoreRole) {
            const roles = member.roles.cache.filter(r => !r.managed && r.name !== '@everyone').map(r => r.id);
            guildData.leftUserRoles[member.id] = roles;
            saveGuildData(member.guild.id, guildData);
        }

        if (guildData.leave.channel && guildData.leave.content) {
            const channel = member.guild.channels.cache.get(guildData.leave.channel);
            if (channel) {
                let msg = guildData.leave.content
                    .replace('@user', `<@${member.id}>`)
                    .replace('<@Id>', `<@${member.id}>`); 
                
                const embed = new EmbedBuilder()
                    .setTitle('👋 Tạm biệt thành viên')
                    .setColor('#FF0000')
                    .setDescription(msg)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: 'Thành viên', value: `${member.user.tag}`, inline: true },
                        { name: 'ID', value: member.id, inline: true },
                        { name: 'Ngày tham gia', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:F>`, inline: true },
                        { name: 'Tổng thành viên', value: member.guild.memberCount.toString(), inline: true }
                    )
                    .setFooter({ text: `Tạm biệt ${member.user.tag}!` })
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            }
        }
    } catch(e) { 
        console.error(e); 
    }
});

// --- ROLE UPDATE EVENTS ---

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const guildData = getGuildData(newMember.guild.id);
        if (guildData.authorizedRoleUsers.length > 0 && guildData.confirmRoleChannel) {
            const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
            if (addedRoles.size === 0 && removedRoles.size === 0) return;

            const checkFlag = (rId) => {
                const key = `${newMember.id}_${rId}`;
                if (global.roleChangeApproved && global.roleChangeApproved[key]) {
                    delete global.roleChangeApproved[key];
                    return true;
                }
                return false;
            };

            setTimeout(async () => {
                const logs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate }).catch(()=>null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || entry.target.id !== newMember.id) return;
                const executor = entry.executor;
                if (executor.bot) return; 
                if (guildData.authorizedRoleUsers.includes(executor.id)) return;
                if (executor.id === newMember.id) return;
                if (newMember.user.bot) return;

                addedRoles.forEach(async role => {
                    if (checkFlag(role.id)) return; 
                    await newMember.roles.remove(role, 'Cần duyệt Role');
                    sendConfirmEmbed(newMember.guild, executor, newMember, role, 'add', guildData.confirmRoleChannel);
                });
                removedRoles.forEach(async role => {
                    if (checkFlag(role.id)) return; 
                    await newMember.roles.add(role, 'Cần duyệt Role');
                    sendConfirmEmbed(newMember.guild, executor, newMember, role, 'remove', guildData.confirmRoleChannel);
                });
            }, 1000);
        }
    } catch(e) { 
        console.error(e); 
    }
});

async function sendConfirmEmbed(guild, executor, target, role, type, channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('🔐 XÁC NHẬN THAY ĐỔI ROLE')
        .setColor('#FFFF00')
        .setDescription(`${executor} muốn ${type === 'add' ? 'thêm' : 'xóa'} role ${role} cho ${target}.\nCần xác nhận từ quản lý.`)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Người thực hiện', value: `${executor} (${executor.id})`, inline: true },
            { name: 'Thành viên bị tác động', value: `${target} (${target.id})`, inline: true },
            { name: 'Role', value: `${role} (${role.id})`, inline: true },
            { name: 'Hành động', value: type === 'add' ? 'Thêm Role' : 'Xóa Role', inline: true },
            { name: 'Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'Vui lòng xác nhận hoặc từ chối thay đổi này' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`role_approve_${target.id}_${role.id}_${type}`)
            .setLabel('Duyệt')
            .setStyle(ButtonStyle.Danger), // Đỏ theo yêu cầu
        new ButtonBuilder()
            .setCustomId(`role_deny_${target.id}_${role.id}_${type}`)
            .setLabel('Không')
            .setStyle(ButtonStyle.Success) // Xanh theo yêu cầu
    );

    await channel.send({ 
        content: `<@${guild.ownerId}>`, // Ping owner hoặc list authorized (ở đây demo ping owner để test)
        embeds: [embed], 
        components: [row] 
    });
}

client.on('roleUpdate', async (oldRole, newRole) => {
    try {
        const guildData = getGuildData(newRole.guild.id);
        if (guildData.roleHierarchyLock) {
            if (oldRole.position !== newRole.position) {
                const logs = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (entry && !entry.executor.bot) {
                    if (newRole.editable) {
                         await newRole.setPosition(oldRole.position).catch(err => {
                             console.log(`[Role Lock] Không thể revert vị trí role ${newRole.name}: ${err.message}`);
                         });
                         
                         // Gửi thông báo role lock
                         const embed = new EmbedBuilder()
                             .setTitle('🔒 Role Hierarchy Lock')
                             .setColor('#FFFF00')
                             .setDescription(`Đã revert vị trí của role ${newRole.name} về vị trí cũ!`)
                             .addFields(
                                 { name: 'Role', value: `${newRole} (${newRole.id})`, inline: true },
                                 { name: 'Người thay đổi', value: `${entry.executor} (${entry.executor.id})`, inline: true },
                                 { name: 'Vị trí cũ', value: oldRole.position.toString(), inline: true },
                                 { name: 'Vị trí mới', value: newRole.position.toString(), inline: true },
                                 { name: 'Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
                             )
                             .setFooter({ text: 'Chế độ khóa vị trí role đã kích hoạt' })
                             .setTimestamp();
                         
                         // Gửi vào kênh chung hoặc kênh log nếu có
                         const logChannel = newRole.guild.systemChannel;
                         if (logChannel) {
                             await logChannel.send({ embeds: [embed] });
                         }
                    } else {
                        // console.log(`[Role Lock] Role ${newRole.name} cao hơn quyền của bot, không thể revert.`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Lỗi trong sự kiện Role Update:", error);
    }
});

// Xử lý lỗi toàn cục
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

client.login(TOKEN);
