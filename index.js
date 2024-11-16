const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const { serialize } = require("./lib/serialize");
const { Message, Image, Sticker } = require("./lib/Base");
const pino = require("pino");
const path = require("path");
const events = require("./lib/event");
const got = require("got");
const config = require("./config");
const { PluginDB } = require("./lib/database/plugins");
const Greetings = require("./lib/Greetings");
const saveCreds  = require("./lib/session");

const store = makeInMemoryStore({
  logger: pino().child({ level: "silent", stream: "store" }),
});

require("events").EventEmitter.defaultMaxListeners = 50;

if (!fs.existsSync("./lib/session/creds.json")) {
  saveCreds(config.SESSION_ID).then(() => {
    console.log("Version : " + require("./package.json").version);
  });
}

fs.readdirSync("./lib/database/").forEach((plugin) => {
  if (path.extname(plugin).toLowerCase() === ".js") {
    require("./lib/database/" + plugin);
  }
});

async function Abhiy() {
  console.log("Syncing Database");
  await config.DATABASE.sync();

  const { state, saveCreds } = await useMultiFileAuthState(
    "./lib/session",
    pino({ level: "silent" })
  );

  let conn = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.macOS("Desktop"),
    downloadHistory: false,
    syncFullHistory: false,
  });

  store.bind(conn.ev);

  setInterval(() => {
    store.writeToFile("./lib/store_db.json");
    console.log("saved store");
  }, 30 * 60 * 1000);

  conn.ev.on("connection.update", async (s) => {
    const { connection, lastDisconnect } = s;

    if (connection === "connecting") {
      console.log("ɴɪᴋᴋᴀ");
      console.log("ᴘʀᴏᴄᴇssɪɴɢ sᴇssɪᴏɴ ɪᴅ");
    }

    if (
      connection === "close" &&
      lastDisconnect &&
      lastDisconnect.error &&
      lastDisconnect.error.output.statusCode !== 401
    ) {
      if (conn?.state?.connection !== "open") {
        console.log(lastDisconnect.error.output.payload);
        Abhiy();
      }
    }

    if (connection === "open") {
      console.log("ʟᴏɢɪɴ sᴜᴄᴄᴇssғᴜʟ ✅");
      console.log("ɪɴsᴛᴀʟʟɪɴɢ ᴘʟᴜɢɪɴs 📥");

      let plugins = await PluginDB.findAll();
      plugins.map(async (plugin) => {
        if (!fs.existsSync("./plugins/" + plugin.dataValues.name + ".js")) {
          console.log(plugin.dataValues.name);
          var response = await got(plugin.dataValues.url);
          if (response.statusCode === 200) {
            fs.writeFileSync(
              "./plugins/" + plugin.dataValues.name + ".js",
              response.body
            );
            require("./plugins/" + plugin.dataValues.name + ".js");
          }
        }
      });
      console.log("ᴘʟᴜɢɪɴs ɪɴsᴛᴀʟʟʀᴅ ✅");

      fs.readdirSync("./plugins").forEach((plugin) => {
        if (path.extname(plugin).toLowerCase() === ".js") {
          require("./plugins/" + plugin);
        }
      });

      console.log("ɴɪᴋᴋᴀ x ᴍᴅ ᴄᴏɴɴᴇᴄᴛᴇᴅ ✅");

      const packageVersion = require("./package.json").version;
      const totalPlugins = events.commands.length;
      const workType = config.WORK_TYPE;
      const statusMessage = `ɴɪᴋᴋᴀ x ᴍᴅ ᴄᴏɴɴᴇᴄᴛᴇᴅ  ✅\nᴠᴇʀsɪᴏɴ: ${packageVersion}\nᴄᴍᴅs: ${totalPlugins}\ᴡᴏʀᴋᴛʏᴘᴇ: ${workType}\n 𝗺𝗮𝗱𝗲 𝘄𝗶𝘁𝗵 ❤️ 𝗯𝘆 𝗵𝗮𝗸𝗶`;

      await conn.sendMessage(conn.user.id, {
        image: { url: "https://files.catbox.moe/mnp025.jpg" },
        caption: `\`\`\`${statusMessage}\`\`\``,
      });
    }

    try {
      conn.ev.on("creds.update", saveCreds);

      conn.ev.on("group-participants.update", async (data) => {
        Greetings(data, conn);
      });

      conn.ev.removeAllListeners("messages.upsert");
      conn.ev.on("messages.upsert", async (m) => {
        if (m.type !== "notify") return;
        let ms = m.messages[0];
        let msg = await serialize(JSON.parse(JSON.stringify(ms)), conn);

        if (!msg.message) return;

        let text_msg = msg.body;
        if (text_msg && config.LOGS) {
          console.log(
            `At : ${
              msg.from.endsWith("@g.us")
                ? (await conn.groupMetadata(msg.from)).subject
                : msg.from
            }\nFrom : ${msg.sender}\nMessage:${text_msg}`
          );
        }

        events.commands.map(async (command) => {
          if (
            command.fromMe &&
            !config.SUDO?.split(",").includes(
              msg.sender?.split("@")[0] || !msg.isSelf
            )
          )
            return;

          let comman;
          if (text_msg) {
            comman = text_msg.trim().split(/ +/)[0];
            msg.prefix = new RegExp(config.HANDLERS).test(text_msg)
              ? text_msg.split("").shift()
              : ",";
          }

          if (command.pattern && command.pattern.test(comman)) {
            var match;
            try {
              match = text_msg.replace(new RegExp(comman, "i"), "").trim();
            } catch {
              match = false;
            }

            whats = new Message(conn, msg, ms);
            command.function(whats, match, msg, conn);
          } else if (text_msg && command.on === "text") {
            whats = new Message(conn, msg, ms);
            command.function(whats, text_msg, msg, conn, m);
          } else if (
            (command.on === "image" || command.on === "photo") &&
            msg.type === "imageMessage"
          ) {
            whats = new Image(conn, msg, ms);
            command.function(whats, text_msg, msg, conn, m, ms);
          } else if (
            command.on === "sticker" &&
            msg.type === "stickerMessage"
          ) {
            whats = new Sticker(conn, msg, ms);
            command.function(whats, msg, conn, m, ms);
          }
        });

        // Add the listener to check for media types and long text messages
        const messageType = Object.keys(msg.message)[0];
        if (messageType === 'imageMessage') {
          await conn.sendMessage(msg.from, { text: 'I detected an image in your message.' });
        } else if (messageType === 'videoMessage') {
          await conn.sendMessage(msg.from, { text: 'I detected a video in your message.' });
        } else if (messageType === 'audioMessage') {
          await conn.sendMessage(msg.from, { text: 'I detected an audio file in your message.' });
        } else if (messageType === 'documentMessage') {
          await conn.sendMessage(msg.from, { text: 'I detected a document in your message.' });
        }

        const text = msg.message.conversation || '';
        if (text.length > 500) {
          await conn.sendMessage(msg.from, { text: 'Your message is too long and could cause issues.' });
        }
      });
    } catch (e) {
      console.log(e.stack + "\n\n\n\n\n" + JSON.stringify(msg));
    }
  });

  process.on("uncaughtException", async (err) => {
    let error = err.message;
    console.log(err);
    await conn.sendMessage(conn.user.id, { text: error });
  });
}

setTimeout(() => {
  Abhiy();
}, 3000);
