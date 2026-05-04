import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { MessageReaction, User } from 'discord.js';
import { REACTION_ROLE_MESSAGE_ID, REACTION_ROLES } from '../../lib/reactionRoles';

@ApplyOptions<Listener.Options>({
    event: Events.MessageReactionRemove
})
export class MessageReactionRemoveListener extends Listener<typeof Events.MessageReactionRemove> {
    public override async run(reaction: MessageReaction, user: User) {
        if (user.bot) return;

        try {
            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();

            const { message } = reaction;
            if (!message.guild) return;
            if (message.id !== REACTION_ROLE_MESSAGE_ID) return;

            const roleId = reaction.emoji.name ? REACTION_ROLES[reaction.emoji.name] : null;
            if (!roleId) return;

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            await member.roles.remove(roleId);

            this.container.logger.info(
                `[ReactionRoles] Removed role ${roleId} from ${user.tag} via ${reaction.emoji.name}.`
            );
        } catch (error) {
            this.container.logger.error('[ReactionRoles] Error while removing role:', error);
        }
    }
}