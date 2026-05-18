import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getConversation(userA: string, userB: string) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userA, receiverId: userB },
          { senderId: userB, receiverId: userA },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, photo: true } },
        receiver: { select: { id: true, name: true, photo: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getInbox(userId: string) {
    // Latest message per conversation partner
    const sent = await this.prisma.message.findMany({
      where: { senderId: userId },
      include: { receiver: { select: { id: true, name: true, photo: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const received = await this.prisma.message.findMany({
      where: { receiverId: userId },
      include: { sender: { select: { id: true, name: true, photo: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Group by partner
    const partners = new Map<string, any>();
    for (const m of [...sent, ...received]) {
      const partnerId = m.senderId === userId ? m.receiverId : m.senderId;
      const partner = m.senderId === userId ? (m as any).receiver : (m as any).sender;
      if (!partners.has(partnerId)) partners.set(partnerId, { partner, lastMessage: m });
    }
    return Array.from(partners.values()).sort(
      (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
    );
  }

  async send(senderId: string, receiverId: string, content: string) {
    return this.prisma.message.create({
      data: { senderId, receiverId, content },
      include: {
        sender: { select: { id: true, name: true, photo: true } },
        receiver: { select: { id: true, name: true, photo: true } },
      },
    });
  }

  async markRead(userId: string, partnerId: string) {
    await this.prisma.message.updateMany({
      where: { senderId: partnerId, receiverId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getTeachers() {
    return this.prisma.user.findMany({
      where: { role: { in: ['TEACHER', 'ADMIN'] } },
      select: { id: true, name: true, photo: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
