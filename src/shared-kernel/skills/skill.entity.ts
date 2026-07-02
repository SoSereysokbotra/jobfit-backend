import { Entity } from '@core/domain/entity';

export interface SkillProps {
  name: string;
  slug: string;
}

export class SkillEntity extends Entity<SkillProps> {
  get name(): string { return this.props.name; }
  get slug(): string { return this.props.slug; }

  private constructor(props: SkillProps, id?: string) {
    super(props, id);
  }

  public static create(props: SkillProps, id?: string): SkillEntity {
    return new SkillEntity(props, id);
  }
}
