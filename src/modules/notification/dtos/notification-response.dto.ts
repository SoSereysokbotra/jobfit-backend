import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { $Enums, Notification } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty() id: string;

  @ApiProperty({ enum: $Enums.NotificationType })
  type: $Enums.NotificationType;

  @ApiProperty() title: string;
  @ApiProperty() body: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'In-app path to what this is about. Null when there is nowhere to go.',
  })
  link: string | null;

  @ApiProperty({ description: 'Whether the recipient has seen it.' })
  read: boolean;

  @ApiProperty() createdAt: Date;

  constructor(row: Notification) {
    this.id = row.id;
    this.type = row.type;
    this.title = row.title;
    this.body = row.body;
    this.link = row.link;
    // The column is a timestamp so "when did they see it?" stays answerable; the client
    // only ever asks the boolean question.
    this.read = row.readAt !== null;
    this.createdAt = row.createdAt;
  }
}

export class UnreadCountResponseDto {
  @ApiProperty() unread: number;
}
