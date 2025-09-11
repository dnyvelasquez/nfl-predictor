import { Component, OnInit } from '@angular/core';
import { Service, Equipo } from '../../services/data';

@Component({
  selector: 'app-equipos',
  standalone: true,
  imports: [], 
  templateUrl: './equipos.html',
  styleUrl: './equipos.css'
})
export class Equipos implements OnInit {
  equipos: Equipo[] = [];

  constructor(private service: Service) {}

  ngOnInit(): void {
    this.equipos = this.service.getEquipos();
  }
}
