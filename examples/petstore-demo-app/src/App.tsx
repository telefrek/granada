/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';

import './App.css';

import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';

function App() {
  const [message, setMessage] = useState('none');

  function handleClick(_e: unknown) {
    const getMessage = async () => {
      const resp = await fetch('http://localhost:8080/message');
      if (resp.status === 503) {
        setMessage('throttled');
      } else if (resp.status === 200) {
        setMessage(JSON.stringify(await resp.json()));
      } else {
        setMessage('error');
      }
    };

    void getMessage();
  }

  return (
    <Container fluid>
      <Row className="justify-content-md-center">
        <Col md="auto">
          <Button name="testClick" onClick={handleClick}>
            Get Response
          </Button>
        </Col>
      </Row>

      <Row className="justify-content-md-center">
        <Col md="auto">{message}</Col>
      </Row>
    </Container>
  );
}

export default App;
