import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="legal-page">
      <h1>Privacy Policy</h1>
      <p class="effective">Effective Date: March 2026</p>

      <section>
        <h2>1. Information We Collect</h2>
        <p>When you use Ladders, we collect:</p>
        <ul>
          <li><strong>Account information:</strong> Name, email address, and profile photo (via Google Sign-In or email registration)</li>
          <li><strong>Location data:</strong> Approximate location (city-level) to show nearby leagues, collected only with your permission</li>
          <li><strong>Match data:</strong> Match results, scores, rankings, and league participation</li>
          <li><strong>Communications:</strong> Messages you send to opponents through the in-app chat</li>
          <li><strong>Usage data:</strong> Pages visited, features used, and device information for analytics</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and operate the matchmaking and ranking services</li>
          <li>To display your name and stats on leaderboards</li>
          <li>To send notifications about matches and league activity</li>
          <li>To improve the Service through analytics</li>
          <li>To enforce our Terms of Service</li>
        </ul>
      </section>

      <section>
        <h2>3. Information Sharing</h2>
        <p>We do not sell your personal information. Your profile name, rank, and match history are visible to other users as part of the Service's core functionality (leaderboards, match history). We may share data with:</p>
        <ul>
          <li><strong>Firebase/Google:</strong> For authentication, database, and analytics services</li>
          <li><strong>Law enforcement:</strong> If required by law</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Storage</h2>
        <p>Your data is stored in Google Cloud/Firebase infrastructure. We use industry-standard security practices to protect your data.</p>
      </section>

      <section>
        <h2>5. Your Rights</h2>
        <p>You can:</p>
        <ul>
          <li>Access your profile data at any time through the app</li>
          <li>Update your display name and contact preferences</li>
          <li>Request deletion of your account and associated data by contacting us</li>
          <li>Opt out of push notifications through your browser settings</li>
        </ul>
      </section>

      <section>
        <h2>6. Cookies and Tracking</h2>
        <p>We use Firebase Analytics (Google Analytics 4) to understand how the Service is used. We also use Google AdSense, which may use cookies for ad personalization. You can manage cookie preferences through your browser settings.</p>
      </section>

      <section>
        <h2>7. Children's Privacy</h2>
        <p>The Service is not intended for children under 13. We do not knowingly collect information from children under 13.</p>
      </section>

      <section>
        <h2>8. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify users of significant changes through the Service.</p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>For privacy-related questions, please reach out via the <a routerLink="/help">Help</a> page.</p>
      </section>
    </div>
  `,
  styleUrl: './legal.component.scss'
})
export class PrivacyComponent {}
