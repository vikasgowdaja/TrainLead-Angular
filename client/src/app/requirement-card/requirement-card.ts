import { Component, input } from '@angular/core';
import { Requirement } from '../requirement.model';

@Component({
  selector: 'app-requirement-card',
  styleUrl: './requirement-card.scss',
  templateUrl: './requirement-card.html',
})
export class RequirementCard {
  readonly requirement = input.required<Requirement>();
}