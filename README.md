# Interlink Auto Bot

Automated bot for claiming Interlink Labs airdrop tokens, designed for the Interlink platform.

## 🚦 Register

- **Link**: https://interlinklabs.ai/referral?refCode=88570

## 🚀 Features

- **Automatic Token Claims**: Claims airdrop tokens every 4 hours automatically
- **Smart Proxy Support**: Rotates between multiple proxies to avoid IP blocks
- **Persistent Login**: Securely stores your JWT token for automatic reconnection
- **Error Handling**: Robust error handling with automatic retry mechanisms
- **OTP Support**: Full support for email-based OTP verification

## 📋 Prerequisites

- Node.js v16.x or higher
- NPM v8.x or higher
- Valid Interlink account with email verification

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/vikitoshi/Interlink-Auto-Bot.git
cd Interlink-Auto-Bot
```

2. Install dependencies:
```bash
npm install
```

3. Set up your proxies (optional):
Create a `proxies.txt` file in the root directory and add your proxies, one per line.
Format: `host:port:username:password` or `protocol://host:port:username:password`

## 🚦 Usage

Run the bot:
```bash
node index.js
```

On first run, you'll be prompted to enter:
- Your login ID or email
- Your passcode
- Your verification email

An OTP will be sent to your email. Enter the OTP when prompted.

After successful login, the bot will:
1. Display your account information
2. Check if tokens are claimable
3. Claim tokens if available
4. Set up a countdown timer to the next claim
5. Automatically attempt claims at the optimal time

## ⚙️ Configuration

### Proxy Setup

The bot supports HTTP, HTTPS, SOCKS4, and SOCKS5 proxies.

Example proxies.txt:
```
http://1.2.3.4:8080:user:pass
socks5://5.6.7.8:1080
1.2.3.4:8080:user:pass
```

### Claim Interval

The default claim interval is 4 hours. You can modify this in the source code if needed.

## 📝 Notes

- The bot stores your JWT token in `token.txt` for persistent sessions
- If your token expires, the bot will automatically prompt for re-login
- Token balance is displayed after each successful claim
- Console output is color-coded for better visibility

## 🔒 Security

- Your credentials are never stored in plain text
- The bot only stores the JWT token, not your login credentials
- All API requests are made over HTTPS

## ⚠️ Disclaimer

This bot is for educational purposes only. Use at your own risk. The developers are not responsible for any account restrictions or bans resulting from the use of this bot.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Contributors

- Airdrop Insiders Community

## 🙏 Support

If you find this bot helpful, consider supporting us by using our referral codes or contributing to the project.