import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Requirement } from '../requirement.model';

@Component({
  selector: 'app-requirement-card',
  imports: [RouterLink],
  styleUrl: './requirement-card.scss',
  templateUrl: './requirement-card.html',
})
export class RequirementCard {
  readonly requirement = input.required<Requirement>();
}