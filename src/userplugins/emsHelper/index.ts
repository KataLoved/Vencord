/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildMemberStore, MessageStore, RestAPI, UserStore } from "@webpack/common";
import { Embed, Message, GuildMember } from "@vencord/discord-types";
import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { updateMessage } from "@api/MessageUpdater";
import { GuildRoleStore } from "@webpack/common";

const root = {
	TARGET_CHANNEL_ID: "1280952569946177629",
	TARGET_GUILD_ID: "1274111070415487097",
	WAIT_TIME: 1500
};

const Regulars = {
	identify: /(?<name>\w+\s\w+)((?:\s|\s?[\|il]\s)?)(?<id>\d{1,6})/i,
	role: /[\wА-Яа-яЁё\s-]+\s\[(?<currentLevel>\d+)\]\s→\s[\wА-Яа-яЁё\s-]+\s\[(?<newLevel>\d+)\]/i
};

const settings = definePluginSettings({
	checkCount: {
		description: "Число сообщений, которые будут проверяться",
		type: OptionType.NUMBER,
		default: 5,
		restartNeeded: false
	},
	ignoreAlreadyChecked: {
		description: "Проверять запросы, которые уже проверены",
		type: OptionType.BOOLEAN,
		default: false,
		restartNeeded: false
	},
	beta: {
		description: "Включить экспериментальные функции",
		type: OptionType.BOOLEAN,
		default: false,
		restartNeeded: false,
		onChange(value: boolean) {
			console.log(`[EmsHelper]: Experimental features are ${value ? "enabled" : "disabled"}.`);
		}
	}
});

export default definePlugin({
	name: "EmsHelper",
	description: "Автоматически проверяет формы заявок на повышение",
	authors: [{ name: "NastyaLove", id: 450994494247010314n }],
	settings,

	flux: {
		MESSAGE_CREATE({ channelId, message }: { channelId: string; message: Message; }) {
			if (channelId !== root.TARGET_CHANNEL_ID) return;
			if (message.type !== 0) return; // @ts-ignore
			setTimeout(() => this.checkChannelMessages(true), 500);
		},
		CHANNEL_SELECT({ channelId }: { channelId: string; }) {
			if (channelId !== root.TARGET_CHANNEL_ID) return; // @ts-ignore
			setTimeout(() => this.checkChannelMessages(), root.WAIT_TIME);
		}
	},

	async checkChannelMessages(onlyNewMessage: boolean = false): Promise<void> {
		const channel = ChannelStore.getChannel(root.TARGET_CHANNEL_ID);
		if (!channel || channel.guild_id !== root.TARGET_GUILD_ID) return;

		const messages = MessageStore.getMessages(root.TARGET_CHANNEL_ID);
		if (!messages) return;

		const filter = (msg: Message) => msg.type === 0 && msg.embeds.length === 1;
		const messageArray = messages._array.toReversed().filter(filter) || [];
		const lastFive = messageArray.slice(0, onlyNewMessage ? 1 : settings.store.checkCount).toReversed() as Message[];

		for (const msg of lastFive) {
			await this.checkMessage(msg);
			await new Promise(res => setTimeout(res, 1500));
		}
	},

	async checkMessage(message: Message): Promise<void> {
		const isAlreadyChecked = this.isAlreadyChecked(message);
		if (!settings.store.ignoreAlreadyChecked) {
			if (isAlreadyChecked) return;
		}

		console.log(`╰┈➤ [${this.name}]: Check message: ${message.id}`);

		const embed: Embed = message.embeds[0];
		if (!embed.fields || embed.fields.length === 0) return;

		const identifyField = embed.fields.find(f => f.rawName.includes("Имя Фамилия | Static ID"));
		const rankField = embed.fields.find(f => f.rawName.includes("На какой ранг повышаетесь"));
		const reportField = embed.fields.find(f => f.rawName.includes("Отчёт на повышение"));
		const senderField = embed.fields.find(f => f.rawName.includes("Отправил(а)"));
		if (!identifyField || !rankField || !reportField || !senderField) return;

		const userIdMatch = senderField.rawValue?.match(/<@!?(\d+)>/);
		if (!userIdMatch) return;

		const member = GuildMemberStore.getMember(root.TARGET_GUILD_ID, userIdMatch[1]);
		let isUpdated = false;

		if (member) {
			const matchIdentify = identifyField.rawValue.match(Regulars.identify);
			const matchRank = rankField.rawValue.match(Regulars.role);

			if (identifyField) {
				const displayName = (member?.nick || UserStore.getUser(member.userId)?.username).toLowerCase();
				let nameEmoji: string;

				if (!matchIdentify) {
					nameEmoji = "❌";
					console.log(`╰┈➤ [${this.name}][${message.id}]: Identify Status: IsNotMatched - "${identifyField.rawValue}" (${nameEmoji})`);
				} else {
					const nameTrimmed = matchIdentify.groups!.name.trim().toLowerCase();
					const idTrimmed = matchIdentify.groups!.id.trim();

					const isValid = displayName.includes(nameTrimmed) && displayName.includes(idTrimmed);
					nameEmoji = isValid ? "✅" : "❌";

					if (nameEmoji === "❌") {
						console.log(`╰┈➤ [${this.name}][DEBUG][${message.id}]:\n - Display Name: ${displayName}\n - Expected Name: ${nameTrimmed}\n - Expected ID: ${idTrimmed}`);
					}

					console.log(`╰┈➤ [${this.name}][${message.id}]: Identify Status: ${isValid} (${nameEmoji})`);
				}

				if (!identifyField.rawName.startsWith("✅") && !identifyField.rawName.startsWith("❌")) {
					identifyField.rawName = `${nameEmoji} ${identifyField.rawName}`;
					isUpdated = true;
				}
			}

			if (rankField && matchRank) {
				const hasCheckMarkReaction = this.hasCheckMarkReaction(message);
				const currentRoleLevel = (hasCheckMarkReaction ? matchRank.groups!.newLevel : matchRank.groups!.currentLevel).trim();
				const currentRolePart = `${currentRoleLevel} |`;
				const roles = member.roles.map(rId => GuildRoleStore.getRole(root.TARGET_GUILD_ID, rId));

				const hasRole = roles.some(role => role.name.toLowerCase().startsWith(currentRolePart));
				const rankEmoji = hasRole ? "✅" : "⚠️";

				if (rankEmoji === "⚠️") {
					console.log(`╰┈➤ [${this.name}][DEBUG][${message.id}]:\n - Member Roles: [${JSON.stringify(roles.map(r => r.name))}]\n - Expected Role Start: ${currentRolePart}`);
				}

				console.log(`╰┈➤ [${this.name}][${message.id}]: Role Status: ${hasRole} (${rankEmoji})`);
				if (!rankField.rawName.startsWith("✅") && !rankField.rawName.startsWith("⚠️")) {
					rankField.rawName = `${rankEmoji} ${rankField.rawName}`;
					isUpdated = true;
				}
			}

			const isReportApproved = await this.checkReportLink(member, reportField);
			const reportEmoji = isReportApproved === null ? "⚠️" : (isReportApproved ? "✅" : "❌");

			console.log(`╰┈➤ [${this.name}][${message.id}]: Report Status: ${reportEmoji} (${isReportApproved})`);
			if (!reportField.rawName.startsWith("✅") && !reportField.rawName.startsWith("❌") && !reportField.rawName.startsWith("⚠️")) {
				reportField.rawName = `${reportEmoji} ${reportField.rawName}`;
				isUpdated = true;
			}
		} else {
			if (!senderField.rawName.startsWith("❌")) {
				senderField.rawName = `❌ ${senderField.rawName}`;
				isUpdated = true;
			}
		}

		if (!isUpdated) return;

		updateMessage(root.TARGET_CHANNEL_ID, message.id, { embeds: [embed] });
	},

	async checkReportLink(member: GuildMember, field: any): Promise<boolean | null> {
		const fieldValue = field.rawValue || "";

		const discordLinkRegex = /https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
		const match = fieldValue.match(discordLinkRegex);
		if (!match) {
			const hasAnyLink = /https?:\/\//.test(fieldValue);
			return hasAnyLink ? null : false;
		}

		const [, , , , channelId, messageId] = match;
		const cachedMessages = MessageStore.getMessages(channelId);
		if (cachedMessages?._array) {
			const cachedMessage = cachedMessages._array.find((msg: Message) => msg.id === messageId);
			if (cachedMessage) {
				return this.hasCheckMarkReaction(cachedMessage);
			}
		}

		try {
			const response = await RestAPI.get({
				url: `/channels/${channelId}/messages`,
				query: { limit: 1, around: messageId },
				retries: 2
			});

			const targetMessage = response?.body.find((msg: any) => msg.id === messageId) as Message;
			if (!targetMessage) return false;

			if (!targetMessage.content.includes(member.userId)) return false;
			return this.hasCheckMarkReaction(targetMessage);
		} catch (error) {
			console.error(`❌ [${this.name}]: Ошибка при проверке ссылки на отчёт:`, error);
			return null;
		}
	},

	isAlreadyChecked(message: Message): boolean {
		if (message.reactions && message.reactions.length === 0) return false;
		return this.hasDecisionReaction(message);
	},

	hasDecisionReaction(message: any): boolean {
		return this.hasCheckMarkReaction(message) || this.hasCancelReaction(message);
	},

	hasCheckMarkReaction(message: any): boolean {
		if (!message.reactions || message.reactions.length === 0) return false;

		const checkMarkEmojis = ["✅", "☑️", "✓", "white_check_mark"];
		return message.reactions.some((reaction: any) => {
			const emojiName = reaction.emoji.name;
			return checkMarkEmojis.some(check => emojiName === check || emojiName?.includes("check"));
		});
	},

	hasCancelReaction(message: any): boolean {
		if (!message.reactions || message.reactions.length === 0) return false;

		const cancelEmojis = ["❌", "✖️", "x", "cross_mark"];
		return message.reactions.some((reaction: any) => {
			const emojiName = reaction.emoji.name;
			return cancelEmojis.some(cancel => emojiName === cancel || emojiName?.includes("cross"));
		});
	}
});