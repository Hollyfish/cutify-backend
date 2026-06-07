pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Kod alınıyor...'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Bağımlılıklar yükleniyor...'
                bat 'npm install'
            }
        }

        stage('Docker Build & Deploy') {
            steps {
                echo 'Docker image oluşturuluyor...'
                bat 'docker-compose down'
                bat 'docker-compose up -d --build'
            }
        }

        stage('Health Check') {
            steps {
                echo 'API kontrol ediliyor...'
                sleep(time: 15, unit: 'SECONDS')
                bat 'curl -f http://localhost:3000/v1 || exit 1'
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