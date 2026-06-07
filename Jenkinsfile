pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Kod alınıyor...'
                checkout scm
            }
        }

        stage('Docker Build & Deploy') {
            steps {
                echo 'Docker image oluşturuluyor...'
                sh 'docker compose down || true'
                sh 'docker compose up -d --build'
            }
        }

        stage('Health Check') {
            steps {
                echo 'API kontrol ediliyor...'
                sleep(time: 20, unit: 'SECONDS')
                sh 'curl -f http://host.docker.internal:3000/v1 || exit 1'
            }
        }
    }

    post {
        success {
            echo 'Pipeline başarıyla tamamlandı!'
        }
        failure {
            echo 'Pipeline başarısız!'
        }
    }
}