import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BorrarUsuario } from './borrar-usuario';

describe('BorrarUsuario', () => {
  let component: BorrarUsuario;
  let fixture: ComponentFixture<BorrarUsuario>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BorrarUsuario]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BorrarUsuario);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
