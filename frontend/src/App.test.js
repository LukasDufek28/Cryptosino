import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./casino/CasinoWorld', () => () => <div>Casino world</div>);

test('opens the casino world at the home route', async () => {
  render(<App />);
  expect(await screen.findByText('Casino world')).toBeInTheDocument();
});
